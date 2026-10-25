// @vitest-environment happy-dom
import { fileRevision, sourceId } from "@mdbase-reader/core";
import { createEventEmitter } from "@mdbase-reader/reading-surface";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { PreviewGateway } from "./preview.js";
import { SessionReadingLocations, restoredSessionLocation } from "./session-reading-locations.js";
import {
  bindSurfaceReadingContext,
  positionWithinReadingRange,
  resolveSourceReadingRange,
} from "./source-reading-range.js";
import { ChapterReadingChip, SourceReadingBoundary } from "./SourceReadingBoundary.js";
import { useReadingResume } from "./use-reading-resume.js";

import type { Source, SourceSummary } from "@mdbase-reader/core";
import type { EventEmitter, ReaderLocator, ReadingSurface } from "@mdbase-reader/reading-surface";
import type { JSX } from "react";

interface TestSurface extends ReadingSurface {
  readonly locations: EventEmitter<ReaderLocator>;
  currentLocation(): ReaderLocator;
}

// Reader consumes only the renderer-neutral contract; format tests exercise real renderers.
function pdf(source: SourceSummary, revision = source.documents[0]!.revision): TestSurface {
  let current: ReaderLocator = { kind: "pdf", pageIndex: 0 };
  const locations = createEventEmitter<ReaderLocator>();
  return {
    kind: "pdf",
    capabilities: {},
    locations,
    document: {
      document: { ...source.documents[0]!, revision },
      mediaType: "application/pdf",
      url: "/fixtures/anthology.pdf",
    },
    currentLocation: () => current,
    goTo: (locator) => {
      current = locator;
      locations.emit(locator);
      return Promise.resolve(true);
    },
    destroy: () => Promise.resolve(),
    resolveReadingRange: (range) =>
      Promise.resolve(
        range.kind !== "pages" || range.end >= 24
          ? { valid: false, message: "Invalid PDF range" }
          : {
              valid: true,
              start: { kind: "pdf", pageIndex: range.start },
              measure: (locator) => {
                if (locator.kind !== "pdf" || !Number.isSafeInteger(locator.pageIndex)) {
                  return null;
                }
                return {
                  position:
                    locator.pageIndex < range.start
                      ? "before"
                      : locator.pageIndex > range.end
                        ? "after"
                        : "inside",
                  atEnd: locator.pageIndex >= range.end,
                  progress: Math.max(
                    0,
                    Math.min(1, (locator.pageIndex - range.start) / (range.end - range.start + 1)),
                  ),
                };
              },
            },
      ),
  };
}
async function anthology(): Promise<{
  gateway: PreviewGateway;
  sources: readonly SourceSummary[];
  chapter: Source;
  book: Source;
}> {
  const gateway = new PreviewGateway();
  return {
    gateway,
    sources: (await gateway.library()).sources,
    chapter: (await gateway.source(sourceId("src_anthology_chapter_2")))!,
    book: (await gateway.source(sourceId("src_anthology")))!,
  };
}
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("keeps absolute positions, validates resume positions, and isolates book/chapter/cache identities", async () => {
  const { chapter, book } = await anthology();
  const surface = pdf(chapter);
  const range = await resolveSourceReadingRange(chapter, surface);
  expect(range?.valid).toBe(true);
  if (!range?.valid) {
    throw new Error("Expected valid fixture range");
  }
  expect(range.start).toEqual({ kind: "pdf", pageIndex: 10 });
  expect(positionWithinReadingRange(range, { kind: "pdf", pageIndex: 15 })).toBe(true);
  expect(positionWithinReadingRange(range, { kind: "pdf", pageIndex: 20 })).toBe(false);
  expect(positionWithinReadingRange(range, { kind: "pdf", pageIndex: 10.5 })).toBe(false);
  expect(range.measure({ kind: "pdf", pageIndex: 15 })?.progress).toBe(0.5);
  expect(range.measure({ kind: "pdf", pageIndex: 23 })).toMatchObject({
    progress: 1,
    position: "after",
  });
  expect(await resolveSourceReadingRange(book, surface)).toBeNull();
  const locations = new SessionReadingLocations();
  bindSurfaceReadingContext(surface, chapter);
  locations.attach("tab", surface);
  surface.locations.emit({ kind: "pdf", pageIndex: 15 });
  const remount = pdf(chapter);
  bindSurfaceReadingContext(remount, chapter);
  locations.attach("tab", remount);
  expect(restoredSessionLocation(remount)).toEqual({ kind: "pdf", pageIndex: 15 });
  const changed = {
    ...chapter,
    documents: [
      { ...chapter.documents[0]!, range: { kind: "pages", start: 12, end: 18 } as const },
    ],
  };
  const corrected = pdf(changed);
  bindSurfaceReadingContext(corrected, changed);
  locations.attach("tab", corrected);
  expect(restoredSessionLocation(corrected)).toBeUndefined();
  const bookSurface = pdf(book);
  bindSurfaceReadingContext(bookSurface, book);
  locations.attach("tab", bookSurface);
  expect(restoredSessionLocation(bookSurface)).toBeUndefined();
  locations.clear();
});

it.each([undefined, 15, 23])(
  "opens chapter two at its own start or compatible saved location (%s)",
  async (saved) => {
    const { chapter } = await anthology();
    const source: Source = {
      ...chapter,
      ...(saved === undefined
        ? {}
        : {
            reading: {
              status: "reading",
              documentFileId: chapter.documents[0]!.fileId,
              position: { kind: "pdf", pageIndex: saved },
            },
          }),
    };
    const surface = pdf(source);
    const save = vi.fn().mockResolvedValue(undefined);
    function Harness(): JSX.Element {
      const state = useReadingResume({ source, surface, save });
      return <output>{state.status}</output>;
    }
    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
    });
    expect(surface.currentLocation()).toEqual({ kind: "pdf", pageIndex: saved === 15 ? 15 : 10 });
    // A saved position outside the chapter quietly starts at the chapter start.
    expect(host.textContent).not.toContain("outside");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(save).toHaveBeenCalledWith(
      source.id,
      source.documents[0]!.fileId,
      { kind: "pdf", pageIndex: saved === 15 ? 15 : 10 },
      saved === 15 ? 0.5 : 0,
    );
    expect(source.reading?.status).not.toBe("finished");
  },
);

it("leaves a reader outside the chapter where they are when the source record reloads", async () => {
  const { chapter } = await anthology();
  const surface = pdf(chapter);
  const save = vi.fn().mockResolvedValue(undefined);
  function Harness({ source }: { readonly source: Source | null }): null {
    useReadingResume({ source, surface, save });
    return null;
  }
  await act(async () => {
    root.render(<Harness source={chapter} />);
    await Promise.resolve();
  });
  expect(surface.currentLocation()).toEqual({ kind: "pdf", pageIndex: 10 });
  await act(async () => {
    await surface.goTo({ kind: "pdf", pageIndex: 22 });
    await vi.advanceTimersByTimeAsync(1200);
  });
  // Saving the position refreshes the source record, which briefly unloads it.
  const saved: Source = {
    ...chapter,
    reading: {
      status: "reading",
      documentFileId: chapter.documents[0]!.fileId,
      position: { kind: "pdf", pageIndex: 22 },
    },
  };
  await act(async () => {
    root.render(<Harness source={null} />);
    await Promise.resolve();
  });
  await act(async () => {
    root.render(<Harness source={saved} />);
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(surface.currentLocation()).toEqual({ kind: "pdf", pageIndex: 22 });
});

it("restores a position saved elsewhere while the surface was inactive, instead of overwriting it", async () => {
  const { chapter } = await anthology();
  const surface = pdf(chapter);
  const save = vi.fn().mockResolvedValue(undefined);
  function Harness({ source }: { readonly source: Source | null }): null {
    useReadingResume({ source, surface, save });
    return null;
  }
  await act(async () => {
    root.render(<Harness source={chapter} />);
    await Promise.resolve();
  });
  await act(async () => {
    await surface.goTo({ kind: "pdf", pageIndex: 12 });
    await vi.advanceTimersByTimeAsync(1200);
  });
  // Another tab moves on to page index 17 while this surface is inactive.
  await act(async () => {
    root.render(<Harness source={null} />);
    await Promise.resolve();
  });
  save.mockClear();
  const elsewhere: Source = {
    ...chapter,
    reading: {
      status: "reading",
      documentFileId: chapter.documents[0]!.fileId,
      position: { pageIndex: 17, kind: "pdf" },
    },
  };
  await act(async () => {
    root.render(<Harness source={elsewhere} />);
    await vi.advanceTimersByTimeAsync(1200);
  });
  expect(surface.currentLocation()).toEqual({ kind: "pdf", pageIndex: 17 });
  expect(save).not.toHaveBeenCalledWith(
    chapter.id,
    chapter.documents[0]!.fileId,
    { kind: "pdf", pageIndex: 12 },
    expect.anything(),
  );
});

it("does not restore or write a previous source while another shared-file session is hydrating", async () => {
  const { chapter, book } = await anthology();
  const surface = pdf(chapter);
  bindSurfaceReadingContext(surface, book);
  const goTo = vi.spyOn(surface, "goTo");
  const save = vi.fn();
  function Harness(): null {
    useReadingResume({ source: chapter, surface, save });
    return null;
  }
  await act(async () => {
    root.render(<Harness />);
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(goTo).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});

it("keeps chapter reading quiet until the reader leaves, then offers a slim dismissible hint", async () => {
  const { gateway, sources } = await anthology();
  const chapter = (await gateway.source(sourceId("src_anthology_chapter_1")))!;
  const surface = pdf(chapter);
  const open = vi.fn();
  await act(async () => {
    root.render(
      <div className="source-part-reading">
        <ChapterReadingChip source={chapter} sources={sources} surface={surface} open={open} />
        <SourceReadingBoundary source={chapter} sources={sources} surface={surface} open={open} />
        <div className="source-part-document" tabIndex={-1} />
      </div>,
    );
    await Promise.resolve();
  });
  const status = host.querySelector('[role="status"]')!;
  const hint = (): Element | null => host.querySelector('[aria-label="Chapter reading range"]');
  const chip = host.querySelector<HTMLElement>(".chapter-reading-chip summary")!;
  expect(status.getAttribute("aria-live")).toBe("polite");
  // Inside the chapter there is no bar, only the chip in the document actions.
  expect(hint()).toBeNull();
  expect(chip.textContent).toBe("Ch. Chapter 1· 0%");
  expect(chip.getAttribute("aria-label")).toBe("Chapter: Chapter 1, 0% read");
  const menuLinks = [...host.querySelectorAll(".chapter-reading-chip a")];
  expect(menuLinks.map((link) => link.textContent)).toEqual([
    "Continue in the book: An anthology of attention",
    "Next part: Chapter 2",
  ]);
  await act(async () => {
    await surface.goTo({ kind: "pdf", pageIndex: 10 });
  });
  expect(chip.textContent).toBe("Ch. Chapter 1· Outside");
  expect(status.textContent).toBe("You’ve left this chapter: Chapter 1");
  expect(hint()?.textContent).toContain("You’ve left this chapter");
  const links = [...hint()!.querySelectorAll("a")];
  expect(links.map((link) => link.textContent)).toEqual([
    "Next part: Chapter 2",
    "Continue in book",
  ]);
  act(() => links[0]!.click());
  expect(open).toHaveBeenCalledWith(sourceId("src_anthology_chapter_2"));
  // Dismissing hides the hint until the reader returns to the chapter and leaves again.
  const dismiss = hint()!.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')!;
  dismiss.focus();
  act(() => dismiss.click());
  expect(hint()).toBeNull();
  expect(status.textContent).toBe("");
  expect(document.activeElement).toBe(host.querySelector(".source-part-document"));
  await act(async () => {
    await surface.goTo({ kind: "pdf", pageIndex: 12 });
  });
  expect(hint()).toBeNull();
  await act(async () => {
    await surface.goTo({ kind: "pdf", pageIndex: 0 });
  });
  expect(chip.textContent).toBe("Ch. Chapter 1· 0%");
  await act(async () => {
    await surface.goTo({ kind: "pdf", pageIndex: 11 });
  });
  const back = [...hint()!.querySelectorAll("button")].find(
    (button) => button.textContent === "Back to chapter",
  )!;
  back.focus();
  await act(async () => {
    back.click();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(surface.currentLocation()).toEqual({ kind: "pdf", pageIndex: 0 });
  expect(hint()).toBeNull();
  expect(document.activeElement).toBe(host.querySelector(".source-part-document"));
  // The chip's menu returns to the chapter start too.
  await act(async () => {
    await surface.goTo({ kind: "pdf", pageIndex: 5 });
  });
  const start = [...host.querySelectorAll<HTMLButtonElement>(".chapter-reading-chip button")].find(
    (button) => button.textContent === "Go to chapter start",
  )!;
  await act(async () => {
    start.click();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(surface.currentLocation()).toEqual({ kind: "pdf", pageIndex: 0 });
});

it("keeps the hint when the chapter's record refreshes after a position save", async () => {
  const { gateway, sources } = await anthology();
  const chapter = (await gateway.source(sourceId("src_anthology_chapter_1")))!;
  const surface = pdf(chapter);
  const render = (source: SourceSummary): void =>
    root.render(
      <SourceReadingBoundary source={source} sources={sources} surface={surface} open={vi.fn()} />,
    );
  await act(async () => {
    render(chapter);
    await Promise.resolve();
  });
  await act(async () => {
    await surface.goTo({ kind: "pdf", pageIndex: 15 });
  });
  await act(async () => {
    render({ ...chapter });
    await Promise.resolve();
  });
  expect(host.querySelector('[aria-label="Chapter reading range"]')).not.toBeNull();
});

it("shows no hint when a chapter opens on the file's first page before its resume lands", async () => {
  const { chapter, sources } = await anthology();
  const surface = pdf(chapter);
  await act(async () => {
    root.render(
      <SourceReadingBoundary source={chapter} sources={sources} surface={surface} open={vi.fn()} />,
    );
    await Promise.resolve();
  });
  // Chapter two starts on page index 10; the surface still reports page 0.
  expect(host.querySelector('[aria-label="Chapter reading range"]')).toBeNull();
});

it("refuses old-revision and malformed/out-of-document ranges without jumping or saving", async () => {
  const { chapter, sources } = await anthology();
  const surface = pdf(chapter, fileRevision(`sha256:${"b".repeat(64)}`));
  const navigate = vi.spyOn(surface, "goTo");
  const save = vi.fn();
  function Harness(): JSX.Element {
    useReadingResume({ source: chapter, surface, save });
    return (
      <SourceReadingBoundary source={chapter} sources={sources} surface={surface} open={vi.fn()} />
    );
  }
  await act(async () => {
    root.render(<Harness />);
    await Promise.resolve();
  });
  expect(host.textContent).toContain("older revision");
  expect(host.textContent).toContain("Read the whole file");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(navigate).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  const invalid = {
    ...chapter,
    documents: [
      { ...chapter.documents[0]!, range: { kind: "pages", start: 10, end: 90 } as const },
    ],
  };
  expect(await resolveSourceReadingRange(invalid, pdf(invalid))).toMatchObject({ valid: false });
  const unknown = {
    ...chapter,
    documents: chapter.documents.map(({ range: _range, ...entry }) => entry),
    properties: {
      documents: [{ file_id: chapter.documents[0]!.fileId, range: { kind: "future" } }],
    },
  };
  expect(await resolveSourceReadingRange(unknown, pdf(unknown))).toMatchObject({
    valid: false,
    message: expect.stringContaining("unsupported"),
  });
  expect(chapter.documents[0]!.revision).not.toBe(surface.document.document.revision);
});

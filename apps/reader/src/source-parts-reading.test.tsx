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
import { SourceReadingBoundary } from "./SourceReadingBoundary.js";
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
      return <output>{state.notice}</output>;
    }
    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
    });
    expect(surface.currentLocation()).toEqual({ kind: "pdf", pageIndex: saved === 15 ? 15 : 10 });
    if (saved === 23) {
      expect(host.textContent).toContain("outside this chapter");
    }
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

it("shows a polite boundary, keeps free navigation, and offers book and next-part links", async () => {
  const { gateway, sources } = await anthology();
  const chapter = (await gateway.source(sourceId("src_anthology_chapter_1")))!;
  const surface = pdf(chapter);
  const open = vi.fn();
  await act(async () => {
    root.render(
      <SourceReadingBoundary source={chapter} sources={sources} surface={surface} open={open} />,
    );
    await Promise.resolve();
  });
  const start = host.querySelector("button")!;
  start.focus();
  await act(async () => {
    await surface.goTo({ kind: "pdf", pageIndex: 10 });
    surface.locations.emit(surface.currentLocation());
  });
  expect(host.querySelector('[role="status"]')?.textContent).toContain(
    "End of “Chapter 1” — outside chapter",
  );
  expect(host.querySelector('[role="status"]')?.getAttribute("aria-live")).toBe("polite");
  expect(document.activeElement).toBe(start);
  const links = [...host.querySelectorAll("a")];
  expect(links.map((link) => link.textContent)).toEqual([
    "Continue in the book: An anthology of attention",
    "Next part: Chapter 2",
  ]);
  act(() => links[1]!.click());
  expect(open).toHaveBeenCalledWith(sourceId("src_anthology_chapter_2"));
  await act(async () => {
    start.click();
    await Promise.resolve();
  });
  expect(surface.currentLocation()).toEqual({ kind: "pdf", pageIndex: 0 });
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

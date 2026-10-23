// @vitest-environment happy-dom
import {
  annotationId,
  collectionId,
  dateTime,
  fileId,
  fileRevision,
  sourceId,
  type Annotation,
} from "@mdbase-reader/core";
import {
  createEventEmitter,
  type ReaderLocator,
  type ReadingSurface,
} from "@mdbase-reader/reading-surface";
import { act, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { nearestPositionAnnotation, useReadingAnnotation } from "./use-reading-annotation.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const targetDocument = {
  fileId: fileId("reading"),
  file: "[[reading.pdf]]",
  revision: fileRevision(`sha256:${"a".repeat(64)}`),
};
const base: Annotation = {
  id: annotationId("reading-a"),
  collectionId: collectionId("fixture"),
  sourceId: sourceId("source"),
  source: "[[source]]",
  annotationType: "highlight",
  document: targetDocument,
  body: "Passage",
  tags: [],
  createdAt: dateTime("2026-01-01T00:00:00Z"),
};
function surface(location: ReaderLocator): ReadingSurface {
  return {
    kind: location.kind,
    document: { document: targetDocument, mediaType: "application/pdf", url: "blob:test" },
    capabilities: {},
    locations: createEventEmitter<ReaderLocator>(),
    currentLocation: () => location,
    goTo: vi.fn(),
    destroy: vi.fn(),
  };
}
const annotations: Annotation[] = [2, 10, 20].map((pageIndex) => ({
  ...base,
  id: annotationId(`page-${String(pageIndex)}`),
  target: { position: { kind: "pdf", pageIndex } },
}));
it("chooses the closest PDF page and never compares another file/revision or source-only note", () => {
  const current = surface({ kind: "pdf", pageIndex: 9 });
  const stale: Annotation = {
    ...annotations[1]!,
    id: annotationId("stale"),
    document: { ...targetDocument, revision: fileRevision(`sha256:${"b".repeat(64)}`) },
  };
  const other: Annotation = {
    ...annotations[1]!,
    id: annotationId("other"),
    document: { ...targetDocument, fileId: fileId("other") },
  };
  expect(
    nearestPositionAnnotation(
      [stale, other, base, ...annotations],
      current,
      current.currentLocation(),
    ),
  ).toBe("page-10");
  expect(
    nearestPositionAnnotation([stale, other, base], current, current.currentLocation()),
  ).toBeNull();
});
it("compares only compatible HTML/EPUB bookmark progressions", () => {
  const html = surface({ kind: "html", href: "essay.html", progression: 0.6 });
  const bookmark: Annotation = {
    ...base,
    target: { position: { kind: "html", href: "essay.html", progression: 0.5 } },
  };
  expect(nearestPositionAnnotation([bookmark], html, html.currentLocation())).toBe(base.id);
  expect(
    nearestPositionAnnotation([bookmark], html, {
      kind: "html",
      href: "other.html",
      progression: 0.6,
    }),
  ).toBeNull();
  const epub = surface({
    kind: "epub",
    locator: { href: "chapter.xhtml", locations: { progression: 0.5 } },
  });
  const epubBookmark: Annotation = {
    ...base,
    target: {
      position: { kind: "epub", locator: { href: "other.xhtml", locations: { progression: 0.5 } } },
    },
  };
  expect(nearestPositionAnnotation([epubBookmark], epub, epub.currentLocation())).toBeNull();
});
let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
      await Promise.resolve();
    });
  }
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});
it("coalesces reading events, uses renderer-resolved passages, and clears on surface switch", async () => {
  const frames = new Map<number, FrameRequestCallback>();
  let next = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++next, callback);
    return next;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const current = surface({ kind: "pdf", pageIndex: 2 });
  const resolved = vi.fn(() => annotations[2]!.id);
  Object.assign(current.capabilities, { decorations: { nearestAnnotation: resolved } });
  function Harness({ value }: { value: ReadingSurface | null }): JSX.Element {
    const id = useReadingAnnotation(value, annotations);
    return <output>{id ?? "none"}</output>;
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<Harness value={current} />);
    await Promise.resolve();
  });
  const emitter = current.locations as ReturnType<typeof createEventEmitter<ReaderLocator>>;
  await act(async () => {
    emitter.emit({ kind: "pdf", pageIndex: 10 });
    emitter.emit({ kind: "pdf", pageIndex: 20 });
    await Promise.resolve();
  });
  expect(frames.size).toBe(1);
  await act(async () => {
    for (const callback of frames.values()) {
      callback(0);
    }
    frames.clear();
    await Promise.resolve();
  });
  expect(host.textContent).toBe("page-20");
  expect(resolved).toHaveBeenCalledOnce();
  await act(async () => {
    root!.render(<Harness value={null} />);
    await Promise.resolve();
  });
  expect(host.textContent).toBe("none");
  await act(async () => {
    emitter.emit({ kind: "pdf", pageIndex: 2 });
    await Promise.resolve();
  });
  expect(frames.size).toBe(0);
});

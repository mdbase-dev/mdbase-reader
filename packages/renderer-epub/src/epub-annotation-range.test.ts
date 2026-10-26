// @vitest-environment happy-dom
import { fileId, fileRevision } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { containsEpubAnnotationRange, resolveEpubReadingRange } from "./epub-reading-range.js";
import { ReadiumEpubSurface } from "./epub-surface.js";

import type { ReadiumRuntime } from "./readium-runtime.js";
import type { AnnotationTarget, DocumentRange } from "@mdbase-reader/core";
import type { Publication } from "@readium/shared";

const base = "https://reader.test/book/";
const range = { kind: "epub-spine", start: "z.xhtml", end: "a.xhtml" } as const;
const point = (index: number, offset: number): string =>
  `epubcfi(/6/${String((index + 1) * 2)}!/4/2/1:${String(offset)})`;
const selection = (index: number, start: number, end: number): AnnotationTarget => ({
  quote: { exact: "selected" },
  epub: {
    cfi: `epubcfi(/6/${String((index + 1) * 2)}!/4/2,/1:${String(start)},/1:${String(end)})`,
  },
});

function fixture(): {
  surface: ReadiumEpubSurface;
  read: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  goTo: ReturnType<typeof vi.fn>;
} {
  const read = vi
    .fn()
    .mockResolvedValue(
      '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Book</title></head><body><p>0123456789</p></body></html>',
    );
  const close = vi.fn();
  const publication = {
    readingOrder: {
      items: ["front.xhtml", "z.xhtml", "a.xhtml", "back.xhtml"].map((href) => ({
        href: `${base}OPS/${href}`,
        type: "application/xhtml+xml",
      })),
    },
    get: () => ({ readAsString: read, close }),
  } as unknown as Publication;
  const goTo = vi.fn().mockResolvedValue(true);
  const runtime: ReadiumRuntime = {
    containsAnnotationRange: (range, target) =>
      containsEpubAnnotationRange(publication, base, range, target, "OPS/book.opf"),
    resolveReadingRange: (range) =>
      resolveEpubReadingRange(publication, base, range, "OPS/book.opf"),
    currentLocator: () => ({ href: "OPS/z.xhtml" }),
    goTo,
    clearSelection: () => undefined,
    extractText: () => Promise.resolve(""),
    onLocationChanged: () => () => undefined,
    onTextSelected: () => () => undefined,
    onAnnotationActivated: () => () => undefined,
    setAnnotations: () => undefined,
    setActiveAnnotation: () => undefined,
    setTypography: () => Promise.resolve(),
    destroy: () => Promise.resolve(),
  };
  return {
    surface: new ReadiumEpubSurface(
      {
        document: {
          fileId: fileId("epub"),
          file: "[[book.epub]]",
          revision: fileRevision(`sha256:${"a".repeat(64)}`),
        },
        mediaType: "application/epub+zip",
        url: `${base}manifest.json`,
      },
      runtime,
    ),
    read,
    close,
    goTo,
  };
}

describe("EPUB annotation containment", () => {
  it("uses spine order and absolute CFIs, including whole endpoint resources", async () => {
    const { surface, read, close, goTo } = fixture();
    const contains = surface.capabilities.annotationRange!.contains;
    expect(await contains(range, selection(1, 0, 10))).toBe(true);
    expect(await contains(range, selection(2, 2, 5))).toBe(true);
    expect(await contains(range, selection(0, 2, 5))).toBe(false);
    expect(await contains(range, selection(3, 2, 5))).toBe(false);
    expect(close).toHaveBeenCalledTimes(read.mock.calls.length);
    expect(goTo).not.toHaveBeenCalled();
    await surface.destroy();
    expect(await contains(range, selection(1, 2, 5))).toBeNull();
  });

  it("checks both CFI edges, returning unknown for either crossing or spanning both boundaries", async () => {
    const { surface } = fixture();
    const contains = surface.capabilities.annotationRange!.contains;
    const bounded = { ...range, end: range.start, start_cfi: point(1, 2), end_cfi: point(1, 8) };
    expect(await contains(bounded, selection(1, 2, 8))).toBe(true);
    expect(await contains(bounded, selection(1, 0, 1))).toBe(false);
    expect(await contains(bounded, selection(1, 9, 10))).toBe(false);
    expect(await contains(bounded, selection(1, 1, 3))).toBeNull();
    expect(await contains(bounded, selection(1, 7, 9))).toBeNull();
    expect(await contains(bounded, selection(1, 0, 10))).toBeNull();
    expect(
      await contains(
        { ...range, start_cfi: point(1, 2), end_cfi: point(2, 8) },
        selection(2, 7, 9),
      ),
    ).toBeNull();
  });

  it.each<DocumentRange>([
    { ...range, start: "missing.xhtml" },
    { ...range, start: range.end, end: range.start },
    { ...range, start_cfi: point(2, 2) },
    { ...range, start_cfi: point(1, 99) },
    { ...range, end: range.start, start_cfi: point(1, 8), end_cfi: point(1, 2) },
    { kind: "fragment", start: "#chapter" },
  ])("returns unknown for an invalid range: %j", async (range) => {
    expect(
      await fixture().surface.capabilities.annotationRange!.contains(range, selection(1, 3, 5)),
    ).toBeNull();
  });

  it.each<AnnotationTarget>([
    {},
    { quote: { exact: "selected" } },
    { epub: { cfi: "epubcfi(/6/4!/4/2,/1:8,/1:2)" } },
    { epub: { cfi: point(1, 99) } },
    { epub: { cfi: "epubcfi(/6/4!/4/2/1:2[unsupported])" } },
    { epub: { cfi: "epubcfi(/6/4!/4/200/1:2)" } },
    { epub: { cfi: point(0, 99) } }, // Even outside CFIs must resolve.
    { ...selection(1, 2, 4), epub: { cfi: point(1, 2) } },
    { position: { kind: "epub", locator: { href: "missing.xhtml" } } },
    {
      position: {
        kind: "epub",
        locator: { href: "OPS/z.xhtml", locations: { fragments: ["missing-id"] } },
      },
    },
    {
      position: {
        kind: "epub",
        locator: { href: "OPS/z.xhtml", locations: { fragments: point(1, 2) } },
      },
    },
    {
      position: {
        kind: "epub",
        locator: { href: "OPS/z.xhtml", locations: { fragments: [point(2, 2)] } },
      },
    },
  ])("does not certify unresolvable or unsupported selections: %j", async (target) => {
    expect(
      await fixture().surface.capabilities.annotationRange!.contains(range, target),
    ).toBeNull();
  });

  it("only certifies href-only bookmarks on whole spine resources", async () => {
    const contains = fixture().surface.capabilities.annotationRange!.contains;
    const target = {
      position: { kind: "epub", locator: { href: "OPS/z.xhtml", locations: { progression: 0.5 } } },
    } as const;
    expect(await contains(range, target)).toBe(true);
    expect(await contains({ ...range, start_cfi: point(1, 2) }, target)).toBeNull();
    expect(await contains(range, { epub: { cfi: point(1, 3) } })).toBe(true);
  });

  it("fails closed and closes resources on read failure", async () => {
    const { surface, read, close } = fixture();
    read.mockRejectedValueOnce(new Error("Offline"));
    expect(
      await surface.capabilities.annotationRange!.contains(range, selection(1, 2, 5)),
    ).toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });
});

import { fileId, fileRevision } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { createPdfSearch } from "./pdf-search.js";
import { EmbedPdfSurface } from "./pdf-surface.js";

import type { EmbedPdfRuntime } from "./embedpdf-runtime.js";
import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models";
import type { SearchPlugin } from "@embedpdf/plugin-search";
import type { ScrollPlugin } from "@embedpdf/react-pdf-viewer";
import type { SearchDestination } from "@mdbase-reader/core";

const target = {
  fileId: fileId("pdf"),
  file: "paper.pdf",
  revision: fileRevision(`sha256:${"a".repeat(64)}`),
};
const destination: SearchDestination = {
  document: target,
  location: { kind: "pdf", pageIndex: 1 },
  quote: { exact: "matching passage" },
};
function fixture(
  text = "A matching passage here.",
  count = 1,
): {
  runtime: ReturnType<typeof createPdfSearch>;
  search: ReturnType<SearchPlugin["provides"]>;
  scroll: ReturnType<ScrollPlugin["provides"]>;
} {
  const hits = Array.from({ length: count }, (_, index) => ({
    pageIndex: 1,
    charIndex: 2 + index * 20,
    charCount: 16,
    rects: [{ origin: { x: 30, y: 400 }, size: { width: 120, height: 12 } }],
  }));
  const result = { results: hits, total: hits.length };
  const search = {
    getFlags: () => [],
    getShowAllResults: () => true,
    getState: () => ({ query: destination.quote.exact }),
    setFlags: vi.fn(),
    setShowAllResults: vi.fn(),
    startSearch: vi.fn(),
    stopSearch: vi.fn(),
    searchAllPages: () => ({ toPromise: () => Promise.resolve(result) }),
    goToResult: vi.fn(),
  } as unknown as ReturnType<SearchPlugin["provides"]>;
  const scroll = { scrollToPage: vi.fn() } as unknown as ReturnType<ScrollPlugin["provides"]>;
  const engine = {
    extractText: () => ({ toPromise: () => Promise.resolve(text) }),
    searchAllPages: () => ({ toPromise: () => Promise.resolve(result) }),
  } as unknown as PdfEngine;
  const runtime = createPdfSearch({
    engine,
    search,
    scroll,
    document: () => Promise.resolve({ pageCount: 3 } as PdfDocumentObject),
  });
  return { runtime, search, scroll };
}
describe("PDF passage search", () => {
  it("resolves page and native geometry and uses transient Find highlighting", async () => {
    const { runtime, search, scroll } = fixture();
    expect(await runtime.goToSearchDestination(destination)).toBe(true);
    expect(scroll.scrollToPage).toHaveBeenCalledWith({
      pageNumber: 2,
      pageCoordinates: { x: 30, y: 400 },
      behavior: "instant",
      alignY: 50,
    });
    expect(search.goToResult).toHaveBeenCalledWith(0);
    runtime.clearSearch();
    expect(search.stopSearch).toHaveBeenCalled();
    expect((await runtime.extractSearchSegments()).map((segment) => segment.location)).toEqual([
      { kind: "pdf", pageIndex: 0 },
      { kind: "pdf", pageIndex: 1 },
      { kind: "pdf", pageIndex: 2 },
    ]);
  });
  it.each([
    ["Changed passage", 1],
    ["matching passage matching passage", 2],
    ["A matching passage here.", 2],
    ["A matching passage here.", 0],
  ])("refuses missing, ambiguous or uncertain native evidence: %s", async (text, count) => {
    const { runtime, search, scroll } = fixture(text, count);
    expect(await runtime.goToSearchDestination(destination)).toBe(false);
    expect(search.startSearch).not.toHaveBeenCalled();
    expect(scroll.scrollToPage).not.toHaveBeenCalled();
  });
  it("does not call the runtime for a different revision", async () => {
    const runtime = {
      currentPageIndex: () => 0,
      onAreaSelected: () => vi.fn(),
      onTextSelected: () => vi.fn(),
      onPageChanged: () => vi.fn(),
      onAnnotationActivated: () => vi.fn(),
      goToSearchDestination: vi.fn().mockResolvedValue(true),
    } as unknown as EmbedPdfRuntime;
    const surface = new EmbedPdfSurface(
      { document: target, mediaType: "application/pdf", url: "pdf" },
      runtime,
    );
    expect(
      await surface.capabilities.searchNavigation?.goToDestination({
        ...destination,
        document: { ...target, revision: fileRevision(`sha256:${"b".repeat(64)}`) },
      }),
    ).toBe(false);
    expect(runtime.goToSearchDestination).not.toHaveBeenCalled();
  });
});

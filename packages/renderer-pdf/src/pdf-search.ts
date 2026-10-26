import { MatchFlag } from "@embedpdf/models";
import { resolveSearchQuote } from "@mdbase-reader/core";

import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models";
import type { SearchPlugin } from "@embedpdf/plugin-search";
import type { ScrollPlugin } from "@embedpdf/react-pdf-viewer";
import type { SearchDestination, SearchTextSegment } from "@mdbase-reader/core";

export function createPdfSearch(input: {
  readonly engine: PdfEngine;
  readonly document: (signal?: AbortSignal) => Promise<PdfDocumentObject>;
  readonly search: ReturnType<SearchPlugin["provides"]> | undefined;
  readonly scroll: ReturnType<ScrollPlugin["provides"]>;
}): {
  extractSearchSegments(options?: {
    readonly signal?: AbortSignal;
  }): Promise<readonly SearchTextSegment[]>;
  goToSearchDestination(destination: SearchDestination): Promise<boolean>;
  clearSearch(): void;
} {
  let generation = 0;
  let cleanup = (): void => undefined;
  return {
    async extractSearchSegments(options) {
      const document = await input.document(options?.signal);
      const segments: SearchTextSegment[] = [];
      for (let pageIndex = 0; pageIndex < document.pageCount; pageIndex++) {
        options?.signal?.throwIfAborted();
        segments.push({
          location: { kind: "pdf", pageIndex },
          text: await input.engine.extractText(document, [pageIndex]).toPromise(),
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return segments;
    },
    async goToSearchDestination(destination) {
      const request = ++generation;
      const search = input.search;
      if (!search || destination.location.kind !== "pdf") {
        return false;
      }
      const document = await input.document();
      const pageIndex = destination.location.pageIndex;
      if (pageIndex < 0 || pageIndex >= document.pageCount || !Number.isInteger(pageIndex)) {
        return false;
      }
      const text = await input.engine.extractText(document, [pageIndex]).toPromise();
      if (!resolveSearchQuote(text, destination.quote)) {
        return false;
      }
      // Native character offsets need not equal UTF-16 extraction offsets. Refuse
      // repeated native hits rather than guessing a geometry from an unrelated basis.
      const verified = await input.engine
        .searchAllPages(document, destination.quote.exact, {
          flags: [MatchFlag.MatchCase],
        })
        .toPromise();
      const hits = verified.results.filter((hit) => hit.pageIndex === pageIndex);
      const hit = hits.length === 1 ? hits[0] : undefined;
      if (!hit?.rects[0] || request !== generation) {
        return false;
      }
      const flags = search.getFlags();
      const showAll = search.getShowAllResults();
      cleanup = () => {
        // A subsequent manual Find belongs to the reader, not this transient jump.
        if (search.getState().query === destination.quote.exact) {
          search.stopSearch();
          search.setFlags(flags);
          search.setShowAllResults(showAll);
        }
      };
      search.setFlags([MatchFlag.MatchCase]);
      search.setShowAllResults(false);
      search.startSearch();
      const result = await search.searchAllPages(destination.quote.exact).toPromise();
      if (request !== generation) {
        return false;
      }
      const index = result.results.findIndex(
        (candidate) =>
          candidate.pageIndex === pageIndex &&
          candidate.charIndex === hit.charIndex &&
          candidate.charCount === hit.charCount,
      );
      if (index < 0) {
        search.stopSearch();
        return false;
      }
      search.goToResult(index);
      input.scroll.scrollToPage({
        pageNumber: pageIndex + 1,
        pageCoordinates: hit.rects[0].origin,
        behavior: "instant",
        alignY: 50,
      });
      return true;
    },
    clearSearch() {
      generation++;
      cleanup();
      cleanup = () => undefined;
    },
  };
}

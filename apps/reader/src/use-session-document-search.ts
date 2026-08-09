import { SessionDocumentTextIndex } from "@mdbase-reader/core";
import { useEffect, useState } from "react";

import type { SourceSummary, SourceTextSearchMatch } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export interface SessionDocumentSearchResult {
  readonly matches: readonly SourceTextSearchMatch[];
}

export function useSessionDocumentSearch(
  source: SourceSummary | null,
  surface: ReadingSurface | null,
  query: string,
): SessionDocumentSearchResult {
  const [index] = useState(() => new SessionDocumentTextIndex());
  const [, invalidate] = useState(0);

  useEffect(() => {
    return () => index.clear();
  }, [index]);

  useEffect(() => {
    const extraction = surface?.capabilities.textExtraction;
    if (
      !hasDocumentSearchIntent(query) ||
      !source ||
      !surface ||
      !extraction ||
      !surfaceBelongsToSource(surface, source)
    ) {
      return undefined;
    }
    if (index.has(source.id, surface.document.document)) {
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void extraction
        .extractText({ signal: controller.signal })
        .then((text) => {
          if (!controller.signal.aborted) {
            index.add(source.id, surface.document.document, text);
            invalidate((value) => value + 1);
          }
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [index, query, source, surface]);

  return { matches: index.search(query) };
}

export function hasDocumentSearchIntent(query: string): boolean {
  return query.trim().length > 0;
}

function surfaceBelongsToSource(surface: ReadingSurface, source: SourceSummary): boolean {
  const target = surface.document.document;
  return source.documents.some(
    (document) => document.fileId === target.fileId && document.revision === target.revision,
  );
}

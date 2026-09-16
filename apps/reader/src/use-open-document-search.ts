import { useEffect, useMemo, useState } from "react";

import { searchExcerpt, type SearchExcerpt } from "./search-passages.js";

import type { SourceId, SourceSummary } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

interface IndexedText {
  readonly key: string;
  readonly sourceId: SourceId;
  readonly text: string;
  readonly truncated: boolean;
}
const characterLimit = 1_000_000;
const emptySurfaces: ReadonlyMap<string, ReadingSurface> = new Map();

/** Only currently resident exact revisions; no background opening of the collection. */
export function useOpenDocumentSearch(
  enabled: boolean,
  sources: readonly SourceSummary[],
  surfaces: ReadonlyMap<string, ReadingSurface> = emptySurfaces,
  query: string,
): {
  readonly matches: ReadonlyMap<SourceId, SearchExcerpt>;
  readonly coverage: string;
  readonly problem: string | null;
} {
  const [texts, setTexts] = useState<readonly IndexedText[]>([]);
  const [cache] = useState(() => new WeakMap<ReadingSurface, IndexedText>());
  const [pending, setPending] = useState(enabled);
  const [problem, setProblem] = useState<string | null>(null);
  const documents = useMemo(() => {
    const unique = new Map<string, { key: string; sourceId: SourceId; surface: ReadingSurface }>();
    for (const surface of surfaces.values()) {
      const target = surface.document.document;
      const source = sources.find((item) =>
        item.documents.some(
          (document) => document.fileId === target.fileId && document.revision === target.revision,
        ),
      );
      if (source && surface.capabilities.textExtraction) {
        const key = `${source.id}:${target.fileId}:${target.revision}`;
        unique.set(key, {
          key,
          sourceId: source.id,
          surface,
        });
      }
    }
    return [...unique.values()];
  }, [sources, surfaces]);
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setPending(true);
      setProblem(null);
      setTexts([]);
      void (async () => {
        const next: IndexedText[] = [];
        let failures = 0;
        // Serial extraction avoids concurrent PDF/EPUB text work competing with reading.
        for (const { key, sourceId, surface } of documents) {
          try {
            const cached = cache.get(surface);
            if (cached) {
              next.push(cached);
              continue;
            }
            const text = await surface.capabilities.textExtraction?.extractText({
              signal: controller.signal,
            });
            if (controller.signal.aborted) {
              return;
            }
            if (text) {
              const entry = {
                key,
                sourceId,
                text: text.slice(0, characterLimit),
                truncated: text.length > characterLimit,
              };
              cache.set(surface, entry);
              next.push(entry);
            }
          } catch {
            failures += 1;
          }
        }
        if (!controller.signal.aborted) {
          setTexts(next);
          setPending(false);
          setProblem(
            failures
              ? `${String(failures)} loaded document(s) could not be indexed. Reopen document search to retry.`
              : null,
          );
        }
      })();
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [cache, documents, enabled]);
  const currentKeys = new Set(documents.map(({ key }) => key));
  const currentTexts = texts.filter(({ key }) => currentKeys.has(key));
  const matches = new Map<SourceId, SearchExcerpt>();
  for (const entry of currentTexts) {
    const excerpt = searchExcerpt(entry.text, query);
    if (excerpt) {
      matches.set(entry.sourceId, excerpt);
    }
  }
  const readable = sources.filter((source) => source.documents.length > 0).length;
  return {
    matches,
    problem,
    coverage: `${pending ? "Indexing" : "Searched"} ${String(currentTexts.length)} of ${String(readable)} readable sources. Only loaded, supported documents are searched; suspended tabs are not included.${currentTexts.some((entry) => entry.truncated) ? " Large documents are limited to their first 1,000,000 characters." : ""}`,
  };
}

import { t as translate, plural } from "@lingui/core/macro";
import { searchQuote } from "@mdbase-reader/core";
import { useEffect, useMemo, useState } from "react";

import { searchExcerpt, type SearchExcerpt } from "./search-passages.js";

import type {
  DocumentTarget,
  SearchDestination,
  SearchTextSegment,
  SourceId,
  SourceSummary,
} from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

interface IndexedText {
  readonly key: string;
  readonly sourceId: SourceId;
  readonly segments: readonly SearchTextSegment[];
  readonly document: DocumentTarget;
  readonly locatable: boolean;
  readonly truncated: boolean;
}
const characterLimit = 1_000_000;
const emptySurfaces: ReadonlyMap<string, ReadingSurface> = new Map();

function boundSearchSegments(segments: readonly SearchTextSegment[]): {
  segments: readonly SearchTextSegment[];
  truncated: boolean;
} {
  let remaining = characterLimit;
  let truncated = false;
  const bounded = segments.flatMap((segment) => {
    const text = segment.text.slice(0, remaining);
    remaining -= text.length;
    truncated ||= text.length < segment.text.length;
    return text ? [{ ...segment, text }] : [];
  });
  return { segments: bounded, truncated };
}

async function extractSearchEntry(
  key: string,
  sourceId: SourceId,
  surface: ReadingSurface,
  signal: AbortSignal,
): Promise<IndexedText | null> {
  const extraction = surface.capabilities.textExtraction;
  if (!extraction) {
    return null;
  }
  const located = await extraction.extractSearchSegments?.({ signal });
  const segments = located ?? [
    { location: { kind: "html" as const }, text: await extraction.extractText({ signal }) },
  ];
  const bounded = boundSearchSegments(segments);
  return {
    key,
    sourceId,
    document: surface.document.document,
    locatable: Boolean(located),
    ...bounded,
  };
}

/** Only currently resident exact revisions; no background opening of the collection. */
export function useOpenDocumentSearch(
  enabled: boolean,
  sources: readonly SourceSummary[],
  surfaces: ReadonlyMap<string, ReadingSurface> = emptySurfaces,
  query: string,
): {
  readonly matches: ReadonlyMap<
    SourceId,
    SearchExcerpt & { readonly destination?: SearchDestination }
  >;
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
            const entry = await extractSearchEntry(key, sourceId, surface, controller.signal);
            if (controller.signal.aborted) {
              return;
            }
            if (entry) {
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
              ? translate({
                  message: `${plural(failures, { one: "# loaded document could not be indexed", other: "# loaded documents could not be indexed" })}. Reopen document search to retry.`,
                })
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
  const matches = new Map<SourceId, SearchExcerpt & { readonly destination?: SearchDestination }>();
  for (const entry of currentTexts) {
    for (const segment of entry.segments) {
      const excerpt = searchExcerpt(segment.text, query);
      const quote = searchQuote(segment.text, query);
      if (excerpt && quote && !matches.has(entry.sourceId)) {
        matches.set(entry.sourceId, {
          ...excerpt,
          ...(entry.locatable
            ? { destination: { document: entry.document, location: segment.location, quote } }
            : {}),
        });
      }
    }
  }
  const readable = sources.filter((source) => source.documents.length > 0).length;
  const state = pending ? translate`indexing` : translate`searched`;
  const limit = currentTexts.some((entry) => entry.truncated)
    ? translate` Loaded documents are limited to their first 1,000,000 characters.`
    : "";
  return {
    matches,
    problem,
    coverage: translate`Loaded-document fallback: ${state} ${currentTexts.length} of ${readable} readable sources. Suspended/unopened PDF/EPUB files are not included.${limit}`,
  };
}

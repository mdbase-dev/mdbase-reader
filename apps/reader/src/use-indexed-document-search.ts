import { useEffect, useState } from "react";

import { useLibraryDocumentIndex } from "./LibraryDocumentIndex.js";

import type { LibraryTextHit } from "./library-text-index.js";
import type { SearchExcerpt } from "./search-passages.js";
import type { SourceId, SourceSummary } from "@mdbase-reader/core";

export interface DocumentSearchHit {
  readonly excerpt: SearchExcerpt;
  readonly file: string;
}

/** Current source descriptors are authoritative, even before async reconciliation finishes. */
export function mergeLibraryDocumentMatches(
  sources: readonly SourceSummary[],
  indexed: readonly LibraryTextHit[],
  open: ReadonlyMap<SourceId, SearchExcerpt>,
): ReadonlyMap<SourceId, DocumentSearchHit> {
  const matches = new Map<SourceId, DocumentSearchHit>();
  const byFile = new Map(indexed.map((hit) => [JSON.stringify([hit.fileId, hit.revision]), hit]));
  for (const source of sources) {
    for (const file of source.documents) {
      const hit = byFile.get(JSON.stringify([file.fileId, file.revision]));
      if (hit && !matches.has(source.id)) {
        matches.set(source.id, { excerpt: hit.excerpt, file: file.file });
      }
    }
    const excerpt = open.get(source.id);
    if (excerpt && !matches.has(source.id)) {
      matches.set(source.id, { excerpt, file: source.documents[0]?.file ?? "Loaded document" });
    }
  }
  return matches;
}

export function useIndexedDocumentSearch(
  enabled: boolean,
  query: string,
  sources: readonly SourceSummary[],
  open: ReadonlyMap<SourceId, SearchExcerpt>,
): {
  readonly matches: ReadonlyMap<SourceId, DocumentSearchHit>;
  readonly status: string;
  readonly paused: boolean;
  readonly togglePause: (() => void) | undefined;
} {
  const { client, version, status, paused, togglePause } = useLibraryDocumentIndex();
  const [result, setResult] = useState<{
    client: typeof client;
    query: string;
    hits: readonly LibraryTextHit[];
  } | null>(null);
  useEffect(() => {
    if (!client || !enabled || query.length < 2) {
      return undefined;
    }
    let active = true;
    const timer = setTimeout(() => {
      void client.search(query).then(
        (hits) => {
          if (active) {
            setResult({ client, query, hits });
          }
        },
        () => {
          if (active) {
            setResult({ client, query, hits: [] });
          }
        },
      );
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [client, enabled, query, version]);
  const hits = result?.client === client && result.query === query ? result.hits : [];
  return {
    matches: mergeLibraryDocumentMatches(sources, hits, open),
    status,
    paused,
    togglePause,
  };
}

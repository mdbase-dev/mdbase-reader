import { useEffect, useMemo, useState } from "react";

import { readerErrorMessage } from "./errors.js";
import { filterSources } from "./workspace-model.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SourceId, SourceSummary, SourceTextSearchMatch } from "@mdbase-reader/core";

export type LibrarySearchStatus = "idle" | "searching" | "ready" | "error";

export interface LibrarySearchResult {
  readonly sources: readonly SourceSummary[];
  readonly matches: ReadonlyMap<SourceId, SourceTextSearchMatch>;
  readonly status: LibrarySearchStatus;
  readonly problem: string | null;
}

interface ContentSearchState {
  readonly query: string;
  readonly status: LibrarySearchStatus;
  readonly matches: readonly SourceTextSearchMatch[];
  readonly problem: string | null;
}

export function useLibrarySearch(
  gateway: ReaderWorkspaceGateway,
  sources: readonly SourceSummary[],
  query: string,
  documentMatches: readonly SourceTextSearchMatch[] = [],
): LibrarySearchResult {
  const normalized = query.trim().toLocaleLowerCase();
  const [content, setContent] = useState<ContentSearchState>({
    query: "",
    status: "idle",
    matches: [],
    problem: null,
  });

  useEffect(() => {
    if (normalized.length < 2) {
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setContent({ query: normalized, status: "searching", matches: [], problem: null });
      void gateway
        .searchText(normalized, { signal: controller.signal })
        .then((matches) => {
          if (!controller.signal.aborted) {
            setContent({ query: normalized, status: "ready", matches, problem: null });
          }
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) {
            setContent({
              query: normalized,
              status: "error",
              matches: [],
              problem: readerErrorMessage(reason, "Reader could not search note text."),
            });
          }
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [gateway, normalized]);

  return useMemo(() => {
    const current = content.query === normalized ? content : emptySearch(normalized);
    const matches = new Map(
      mergeSearchMatches(current.matches, documentMatches).map((match) => [match.sourceId, match]),
    );
    return {
      sources: mergeSearchResults(sources, query, matches),
      matches,
      status: current.status,
      problem: current.problem,
    };
  }, [content, documentMatches, normalized, query, sources]);
}

export function mergeSearchMatches(
  ...groups: readonly (readonly SourceTextSearchMatch[])[]
): readonly SourceTextSearchMatch[] {
  const kindsBySource = new Map<SourceId, Set<SourceTextSearchMatch["kinds"][number]>>();
  for (const match of groups.flat()) {
    const kinds = kindsBySource.get(match.sourceId) ?? new Set();
    match.kinds.forEach((kind) => kinds.add(kind));
    kindsBySource.set(match.sourceId, kinds);
  }
  return [...kindsBySource].map(([sourceId, kinds]) => ({ sourceId, kinds: [...kinds] }));
}

export function mergeSearchResults(
  sources: readonly SourceSummary[],
  query: string,
  contentMatches: ReadonlyMap<SourceId, SourceTextSearchMatch>,
): readonly SourceSummary[] {
  if (!query.trim()) {
    return sources;
  }
  const metadataIds = new Set(filterSources(sources, query).map(({ id }) => id));
  return sources.filter(({ id }) => metadataIds.has(id) || contentMatches.has(id));
}

function emptySearch(query: string): ContentSearchState {
  return { query, status: query.length >= 2 ? "searching" : "idle", matches: [], problem: null };
}

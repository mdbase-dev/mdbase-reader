import {
  sourceId,
  type CollectionId,
  type ContentSearchRepository,
  type ReaderRequestOptions,
  type SourceTextMatchKind,
  type SourceTextSearchMatch,
} from "@mdbase-reader/core";

import { outcomeValue } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { QueryInput, QueryRecord } from "@mdbase-dev/connect";

const pageSize = 100;

export class ConnectContentSearchRepository implements ContentSearchRepository {
  constructor(private readonly client: ReaderConnectClient) {}

  async search(
    _collectionId: CollectionId,
    query: string,
    options: ReaderRequestOptions = {},
  ): Promise<readonly SourceTextSearchMatch[]> {
    // Match the locale-independent lower() the query applies to record text.
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }
    const matches = new Map<string, SourceTextSearchMatch>();
    for await (const outcome of this.client.queryPages(searchInput(normalized), {
      ...options,
      firstPageSize: pageSize,
      pageSize: 250,
    })) {
      const records = outcomeValue(outcome, "search source and annotation text").results;
      for (const match of mergeMatches(records, normalized)) {
        const previous = matches.get(match.sourceId);
        matches.set(
          match.sourceId,
          previous
            ? {
                sourceId: match.sourceId,
                kinds: [...new Set([...previous.kinds, ...match.kinds])],
                ...((previous.passages ?? match.passages)
                  ? {
                      passages: [...(previous.passages ?? []), ...(match.passages ?? [])].slice(
                        0,
                        3,
                      ),
                    }
                  : {}),
              }
            : match,
        );
      }
    }
    return [...matches.values()];
  }
}

function searchInput(query: string): QueryInput {
  return {
    types: ["reader-source", "reader-annotation"],
    where: `file.body.lower().contains(${JSON.stringify(query)})`,
    frontmatterMode: "effective" as const,
    includeBody: true,
  };
}

function mergeMatches(
  records: readonly QueryRecord[],
  query: string,
): readonly SourceTextSearchMatch[] {
  const kindsBySource = new Map<string, Set<SourceTextMatchKind>>();
  const passages = new Map<string, NonNullable<SourceTextSearchMatch["passages"]>[number][]>();
  for (const record of records) {
    const match = recordMatch(record);
    if (!match) {
      continue;
    }
    const kinds = kindsBySource.get(match.id) ?? new Set<SourceTextMatchKind>();
    kinds.add(match.kind);
    kindsBySource.set(match.id, kinds);
    const text = record.body;
    if (typeof text === "string") {
      const index = text.toLocaleLowerCase().indexOf(query);
      const items = passages.get(match.id) ?? [];
      if (index >= 0 && items.length < 3) {
        items.push({
          kind: match.kind,
          path: record.path,
          text: text.slice(Math.max(0, index - 100), index + query.length + 150),
        });
        passages.set(match.id, items);
      }
    }
  }
  return [...kindsBySource.entries()].map(([id, kinds]) => ({
    sourceId: sourceId(id),
    kinds: [...kinds],
    ...(passages.has(id) ? { passages: passages.get(id) ?? [] } : {}),
  }));
}

function recordMatch(
  record: QueryRecord,
): { readonly id: string; readonly kind: SourceTextMatchKind } | null {
  const frontmatter = record.effectiveFrontmatter ?? record.frontmatter ?? {};
  const declaredType = frontmatter["type"];
  if (declaredType === "reader-source" || record.types.includes("reader-source")) {
    const id = frontmatter["id"];
    return typeof id === "string" && id ? { id, kind: "source-note" } : null;
  }
  if (declaredType === "reader-annotation" || record.types.includes("reader-annotation")) {
    const id = wikilinkTarget(frontmatter["source"]);
    return id ? { id, kind: "annotation" } : null;
  }
  return null;
}

function wikilinkTarget(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/u.exec(value.trim());
  return match?.[1] ?? null;
}

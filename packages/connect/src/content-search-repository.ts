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

const pageSize = 500;

export class ConnectContentSearchRepository implements ContentSearchRepository {
  constructor(private readonly client: ReaderConnectClient) {}

  async search(
    _collectionId: CollectionId,
    query: string,
    options: ReaderRequestOptions = {},
  ): Promise<readonly SourceTextSearchMatch[]> {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) {
      return [];
    }
    const records: QueryRecord[] = [];
    for await (const outcome of this.client.queryPages(searchInput(normalized), {
      ...options,
      firstPageSize: pageSize,
      pageSize: 1_000,
    })) {
      records.push(...outcomeValue(outcome, "search source and annotation text").results);
    }
    return mergeMatches(records);
  }
}

function searchInput(query: string): QueryInput {
  return {
    where: `file.body.lower().contains(${JSON.stringify(query)})`,
    frontmatterMode: "effective" as const,
    includeBody: false,
  };
}

function mergeMatches(records: readonly QueryRecord[]): readonly SourceTextSearchMatch[] {
  const kindsBySource = new Map<string, Set<SourceTextMatchKind>>();
  for (const record of records) {
    const match = recordMatch(record);
    if (!match) {
      continue;
    }
    const kinds = kindsBySource.get(match.id) ?? new Set<SourceTextMatchKind>();
    kinds.add(match.kind);
    kindsBySource.set(match.id, kinds);
  }
  return [...kindsBySource.entries()].map(([id, kinds]) => ({
    sourceId: sourceId(id),
    kinds: [...kinds],
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

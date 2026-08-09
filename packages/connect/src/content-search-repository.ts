import {
  sourceId,
  type CollectionId,
  type ContentSearchRepository,
  type ReaderRequestOptions,
  type SourceTextMatchKind,
  type SourceTextSearchMatch,
} from "@mdbase-reader/core";

import { outcomeValue, queryWithOptions } from "./repository-client.js";

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
    const input = searchInput(normalized, 0);
    const first = outcomeValue(
      await queryWithOptions(this.client, input, options),
      "search source and annotation text",
    );
    const total = first.meta?.totalCount ?? first.results.length;
    const offsets = Array.from(
      { length: Math.max(0, Math.ceil(total / pageSize) - 1) },
      (_value, index) => (index + 1) * pageSize,
    );
    const pages = await Promise.all(
      offsets.map(async (offset) =>
        outcomeValue(
          await queryWithOptions(
            this.client,
            searchInput(normalized, offset, first.meta?.snapshot),
            options,
          ),
          "search source and annotation text",
        ),
      ),
    );
    return mergeMatches([first, ...pages].flatMap(({ results }) => results));
  }
}

function searchInput(query: string, offset: number, snapshot?: string): QueryInput {
  return {
    where: `file.body.lower().contains(${JSON.stringify(query)})`,
    frontmatterMode: "effective" as const,
    includeBody: false,
    limit: pageSize,
    offset,
    ...(snapshot ? { snapshot } : {}),
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

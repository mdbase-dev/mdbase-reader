import {
  sourceId,
  type SourceId,
  type ReaderRequestOptions,
  type SourceSummary,
} from "@mdbase-reader/core";

import { outcomeValue } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { QueryInput, QueryRecord } from "@mdbase-dev/connect";

const projection = "reader_part_of_ids";
const partRelations =
  'has(record.relations) && relations != null ? relations.filter(r, has(r.relation) && r.relation == "part-of" && has(r.target) && r.target != null) : []';
const resolvedTarget = "r.target.asFile() != null ? r.target.asFile().?id.orValue(null) : null";

/** Nested targets use the same authority-owned asFile resolution as annotation source links. */
export function withResolvedSourceParts(input: QueryInput): QueryInput {
  return {
    ...input,
    projections: {
      ...input.projections,
      [projection]: { expression: `(${partRelations}).map(r, ${resolvedTarget})` },
    },
    select: [...(input.select ?? []), `projection.${projection}`],
  };
}

export function partOfFromResult(record: Pick<QueryRecord, "values">): SourceId | undefined {
  const ids = record.values?.[projection];
  const first: unknown = Array.isArray(ids)
    ? ids.find((id) => typeof id === "string" && id.trim())
    : undefined;
  return typeof first === "string" ? sourceId(first) : undefined;
}

export function sourcePartsWhere(id: SourceId): string {
  return `(${partRelations}).exists(r, r.target.asFile() != null && r.target.asFile().?id.orValue(null) == ${JSON.stringify(id)})`;
}

export async function resolveSourcePartOf(
  client: ReaderConnectClient,
  path: string,
  options: ReaderRequestOptions = {},
): Promise<SourceId | undefined> {
  for await (const outcome of client.queryPages(
    withResolvedSourceParts({
      types: ["reader-source"],
      where: `file.path == ${JSON.stringify(path)}`,
      frontmatterMode: "effective",
    }),
    options,
  )) {
    const record = outcomeValue(outcome, "resolve source parent").results[0];
    if (record) {
      return partOfFromResult(record);
    }
  }
  return undefined;
}

/**
 * Semantic contract queries accept pagination/frontmatter only, not projections.
 * Resolve a page's parent links in one ordinary query, and skip it for pages without parts.
 */
export async function resolveSourceSummaryParts(
  client: ReaderConnectClient,
  sources: readonly SourceSummary[],
  options: ReaderRequestOptions,
): Promise<readonly SourceSummary[]> {
  const paths = sources
    .filter((source) => source.relations?.some((relation) => relation.relation === "part-of"))
    .map((source) => source.path);
  if (paths.length === 0) {
    return sources;
  }
  const parents = new Map<string, SourceId>();
  for await (const outcome of client.queryPages(
    withResolvedSourceParts({
      where: `file.path in ${JSON.stringify(paths)}`,
      frontmatterMode: "effective",
    }),
    options,
  )) {
    for (const record of outcomeValue(outcome, "resolve source parents").results) {
      const parent = partOfFromResult(record);
      if (parent) {
        parents.set(record.path, parent);
      }
    }
  }
  return sources.map((source) => {
    const partOf = parents.get(source.path);
    return partOf ? { ...source, partOf } : source;
  });
}

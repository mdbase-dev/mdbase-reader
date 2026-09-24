import {
  normalizedSourceUrl,
  sameSourceUrl,
  sourceUrlSearchKey,
  type ReaderRequestOptions,
  type SourceSummary,
} from "@mdbase-reader/core";

import { outcomeValue } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { QueryInput, QueryRecord } from "@mdbase-dev/connect";

/**
 * Contract views cannot be filtered in the store, but Reader-created records always persist
 * `type`, `url`, `original_url` and `csl` as raw fields, so these lookups query them directly
 * instead of scanning the library.
 */
const readerSourceType = "reader-source";

export type SourceWhere = (where: string) => Promise<SourceSummary[]>;

export async function queryReaderSources(
  client: ReaderConnectClient,
  where: string,
  options: ReaderRequestOptions,
): Promise<QueryRecord[]> {
  const input: QueryInput = { types: [readerSourceType], where, frontmatterMode: "effective" };
  const records: QueryRecord[] = [];
  for await (const outcome of client.queryPages(input, {
    ...options,
    firstPageSize: 50,
    pageSize: 250,
  })) {
    records.push(...outcomeValue(outcome, "find sources").results);
  }
  return records;
}

export async function findSourceByUrl(
  query: SourceWhere,
  url: string,
): Promise<SourceSummary | null> {
  const normalized = normalizedSourceUrl(url);
  const key = JSON.stringify(sourceUrlSearchKey(url));
  const candidates = await query(
    ["url", "original_url"]
      .map((field) => `(${field} != null && ${field}.lower().contains(${key}))`)
      .join(" || "),
  );
  return (
    candidates.find((source) =>
      [source.url, text(source.properties?.["original_url"])].some(
        (candidate) => candidate !== undefined && sameSourceUrl(candidate, normalized),
      ),
    ) ?? null
  );
}

export async function findSourcesByCitekeyPrefix(
  query: SourceWhere,
  prefix: string,
): Promise<readonly SourceSummary[]> {
  const candidates = await query(
    `csl != null && csl.id != null && csl.id.startsWith(${JSON.stringify(prefix)})`,
  );
  return candidates.filter((source) => source.citation?.id.startsWith(prefix));
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Client-side library search over the fields a source summary shows. */
export function matchesSearch(source: SourceSummary, search: string | undefined): boolean {
  const normalized = search?.trim().toLocaleLowerCase();
  return normalized
    ? [
        source.title,
        ...source.creators,
        ...source.tags,
        source.publication,
        source.site,
        source.published === undefined ? undefined : String(source.published),
      ]
        .filter((value): value is string => value !== undefined)
        .join("\n")
        .toLocaleLowerCase()
        .includes(normalized)
    : true;
}

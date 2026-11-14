import {
  normalizedSourceUrl,
  sameSourceUrl,
  sourceUrlSearchKey,
  type ReaderRequestOptions,
  type SourceSummary,
} from "@mdbase-reader/core";

import { completeReaderPages } from "./repository-client.js";
import { withResolvedSourceParts } from "./source-part-links.js";

import type { MdbaseClient, Query, RecordView } from "@mdbase-dev/sdk";

/**
 * Contract views cannot be filtered in the store, but Reader-created records always persist
 * `type`, `url`, `original_url` and `csl` as raw fields, so these lookups query them directly
 * instead of scanning the library.
 */
const readerSourceType = "reader-source";

export type SourceWhere = (where: string) => Promise<SourceSummary[]>;

export async function queryReaderSources(
  client: MdbaseClient,
  where: string,
  options: ReaderRequestOptions,
): Promise<RecordView[]> {
  const input: Query = withResolvedSourceParts({
    types: [readerSourceType],
    where,
  });
  const records: RecordView[] = [];
  for await (const outcome of completeReaderPages(client, input, {
    ...options,
  })) {
    records.push(...outcome.records);
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

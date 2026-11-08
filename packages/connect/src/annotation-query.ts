import { annotationSourcePages } from "./annotation-source-pages.js";
import { annotationSourceReference } from "./annotation-source.js";
import { ConnectRepositoryError, outcomeValue, recordPathById } from "./repository-client.js";

import type {
  QueryInput,
  QueryRecord,
  QueryMetadataRecord,
  QueryPage,
  QueryMetadataPage,
  ReadManyRecord,
} from "./connect-types.js";
import type { ReaderConnectClient } from "./repository-client.js";
import type { ReaderRequestOptions, SourceId } from "@mdbase-reader/core";

/** Filter Reader's persisted source references before transferring annotation metadata. */
export async function annotationPathsForSource(
  client: ReaderConnectClient,
  source: SourceId,
  options: ReaderRequestOptions,
): Promise<string[]> {
  return [...(await annotationCandidatesForSource(client, source, options)).keys()];
}

export async function annotationCandidatesForSource(
  client: ReaderConnectClient,
  source: SourceId,
  options: ReaderRequestOptions,
): Promise<Map<string, unknown>> {
  try {
    const path = await recordPathById(client, source, options);
    const [linked, legacy] = await Promise.all([
      path ? sourceAnnotationRecords(client, linksToSource(path), options) : [],
      sourceAnnotationRecords(
        client,
        `has(record.source) && source != null && source.asFile() == null && source.contains(${JSON.stringify(source)})`,
        options,
      ),
    ]);
    return new Map(
      [
        ...linked,
        ...legacy.filter((record) => annotationSourceReference(sourceValue(record)) === source),
      ].map((record) => [record.path, sourceValue(record)]),
    );
  } catch (error) {
    if (!(error instanceof ConnectRepositoryError) || error.code !== "query_budget_exceeded") {
      throw error;
    }
  }
  // Single-source Notes compatibility: delete this discovery fallback when the runtime serves backlinks.
  const candidates = new Map<string, unknown>();
  for await (const page of annotationSourcePages(client, {
    ...options,
    sourceIds: new Set([source]),
  })) {
    for (const entry of page) {
      candidates.set(entry.path, entry.reference);
    }
  }
  return candidates;
}

async function sourceAnnotationRecords(
  client: ReaderConnectClient,
  where: string,
  options: ReaderRequestOptions,
): Promise<(QueryRecord | QueryMetadataRecord)[]> {
  const input: QueryInput = {
    types: ["reader-annotation"],
    where,
    frontmatterMode: "effective",
  };
  const paging = { ...options, firstPageSize: 100, pageSize: 100 };
  const metadata = outcomeValue(
    await client.supportsAuthorityFeature("query-metadata-v1", options),
    "discover metadata queries",
  );
  const pages = metadata
    ? client.queryPages(
        { ...input, output: "metadata", includeBody: false, select: ["source"] },
        paging,
      )
    : client.queryPages(input, paging);
  const records: (QueryRecord | QueryMetadataRecord)[] = [];
  for await (const outcome of pages) {
    records.push(
      ...outcomeValue<QueryPage | QueryMetadataPage>(outcome, "find source annotations").results,
    );
  }
  return records;
}

function sourceValue(record: QueryRecord | QueryMetadataRecord): unknown {
  return "file" in record
    ? (record.effectiveFrontmatter ?? record.frontmatter)?.["source"]
    : record.values["source"];
}

/**
 * The full query records (body and both frontmatter forms) at `paths`, keyed by path.
 * Hosted collections evaluate link-following filters from projections and refuse exact
 * output for them, so bodies are fetched here by path, with a filter that follows no links.
 */
export async function annotationRecordsAt(
  client: ReaderConnectClient,
  paths: readonly string[],
  options: ReaderRequestOptions,
): Promise<Map<string, ReadManyRecord>> {
  const result = outcomeValue(
    await client.readMany(paths, {
      types: ["reader-annotation"],
      includeBody: true,
      // Sibling batches must not supersede one another; cancellation owns this load's lifetime.
      ...(options.signal ? { signal: options.signal } : {}),
    }),
    "read annotation bodies",
  );
  return new Map(
    result.results.flatMap((entry) =>
      entry.status === "found" ? [[entry.path, entry.record] as const] : [],
    ),
  );
}

/** Annotations whose `source` link resolves to the file at `path`. */
function linksToSource(path: string): string {
  const source = 'record["source"]';
  return `"source" in record && ${source} != null && ${source}.asFile() != null && ${source}.asFile().file.path == ${JSON.stringify(path)}`;
}

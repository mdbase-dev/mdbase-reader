import { linksTo } from "@mdbase-dev/connect";

import { annotationSourceReference } from "./annotation-source.js";
import { outcomeValue, recordPathById } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type {
  QueryInput,
  QueryRecord,
  QueryMetadataRecord,
  QueryPage,
  QueryMetadataPage,
  ReadManyRecord,
} from "@mdbase-dev/connect";
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
  const records = await sourceAnnotations(client, source, options, {
    frontmatterMode: "effective",
  });
  return new Map(records.map((record) => [record.path, sourceValue(record)]));
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
      frontmatterMode: "both",
      includeBody: true,
      // Sibling batches must not supersede one another; cancellation owns this load's lifetime.
      ...(options.signal ? { signal: options.signal } : {}),
    }),
    "read annotation bodies",
  );
  // Preserve the all-or-nothing cache check: a failed batch falls back to revisioned reads.
  for (const error of result.errors) {
    outcomeValue(error.failure, "read annotation bodies");
  }
  return new Map(
    result.results.flatMap((entry) =>
      entry.status === "found" ? [[entry.path, entry.record] as const] : [],
    ),
  );
}

async function sourceAnnotations(
  client: ReaderConnectClient,
  source: SourceId,
  options: ReaderRequestOptions,
  detail: Pick<QueryInput, "frontmatterMode" | "includeBody">,
): Promise<(QueryRecord | QueryMetadataRecord)[]> {
  // Never infer identity from a filename: sources can be renamed independently of their IDs.
  const path = await recordPathById(client, source, options);
  const [linked, legacy] = await Promise.all([
    // mdbase resolves each link however it is written, so only the target is compared.
    path
      ? annotationRecords(client, linksTo("source", path), detail, options)
      : Promise.resolve([]),
    // A legacy bare ID resolves to no record where the collection configures no ID field.
    annotationRecords(
      client,
      `has(record.source) && source != null && source.asFile() == null && source.contains(${JSON.stringify(source)})`,
      detail,
      options,
      // contains() is only a candidate filter; aliases and prefix collisions must not match.
      (record) => annotationSourceReference(sourceValue(record)) === source,
    ),
  ]);
  return [...linked, ...legacy];
}

async function annotationRecords(
  client: ReaderConnectClient,
  where: string,
  detail: Pick<QueryInput, "frontmatterMode" | "includeBody">,
  options: ReaderRequestOptions,
  accept: (record: QueryRecord | QueryMetadataRecord) => boolean = () => true,
): Promise<(QueryRecord | QueryMetadataRecord)[]> {
  const records: (QueryRecord | QueryMetadataRecord)[] = [];
  const input = { types: ["reader-annotation"], where, ...detail };
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
  for await (const outcome of pages) {
    for (const record of outcomeValue<QueryPage | QueryMetadataPage>(
      outcome,
      "find source annotations",
    ).results) {
      if (accept(record)) {
        records.push(record);
      }
    }
  }
  return records;
}

function sourceValue(record: QueryRecord | QueryMetadataRecord): unknown {
  return "file" in record
    ? (record.effectiveFrontmatter ?? record.frontmatter)?.["source"]
    : record.values["source"];
}

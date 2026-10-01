import { annotationSourceReference } from "./annotation-source.js";
import { outcomeValue, recordPathById } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { QueryInput, QueryRecord } from "@mdbase-dev/connect";
import type { ReaderRequestOptions, SourceId } from "@mdbase-reader/core";

/** Filter Reader's persisted source references before transferring annotation metadata. */
export async function annotationPathsForSource(
  client: ReaderConnectClient,
  source: SourceId,
  options: ReaderRequestOptions,
): Promise<string[]> {
  const records = await sourceAnnotations(client, source, options, {
    frontmatterMode: "effective",
  });
  return records.map(({ path }) => path);
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
): Promise<Map<string, QueryRecord>> {
  const records = new Map<string, QueryRecord>();
  for (let start = 0; start < paths.length; start += pathsPerQuery) {
    const where = paths
      .slice(start, start + pathsPerQuery)
      .map((path) => `file.path == ${JSON.stringify(path)}`)
      .join(" || ");
    for (const record of await annotationRecords(
      client,
      where,
      { frontmatterMode: "both", includeBody: true },
      options,
    )) {
      records.set(record.path, record);
    }
  }
  return records;
}

const pathsPerQuery = 50;

async function sourceAnnotations(
  client: ReaderConnectClient,
  source: SourceId,
  options: ReaderRequestOptions,
  detail: Pick<QueryInput, "frontmatterMode" | "includeBody">,
): Promise<QueryRecord[]> {
  // Never infer identity from a filename: sources can be renamed independently of their IDs.
  const path = await recordPathById(client, source, options);
  const [linked, legacy] = await Promise.all([
    // mdbase resolves each link however it is written, so only the target is compared.
    path
      ? annotationRecords(
          client,
          `source != null && source.asFile() != null && source.asFile().file.path == ${JSON.stringify(path)}`,
          detail,
          options,
        )
      : Promise.resolve([]),
    // A legacy bare ID resolves to no record where the collection configures no ID field.
    annotationRecords(
      client,
      `source != null && source.asFile() == null && source.contains(${JSON.stringify(source)})`,
      detail,
      options,
      // contains() is only a candidate filter; aliases and prefix collisions must not match.
      (record) =>
        annotationSourceReference(
          (record.effectiveFrontmatter ?? record.frontmatter)?.["source"],
        ) === source,
    ),
  ]);
  return [...linked, ...legacy];
}

async function annotationRecords(
  client: ReaderConnectClient,
  where: string,
  detail: Pick<QueryInput, "frontmatterMode" | "includeBody">,
  options: ReaderRequestOptions,
  accept: (record: QueryRecord) => boolean = () => true,
): Promise<QueryRecord[]> {
  const records: QueryRecord[] = [];
  for await (const outcome of client.queryPages(
    { types: ["reader-annotation"], where, ...detail },
    { ...options, firstPageSize: 100, pageSize: 100 },
  )) {
    for (const record of outcomeValue(outcome, "find source annotations").results) {
      if (accept(record)) {
        records.push(record);
      }
    }
  }
  return records;
}

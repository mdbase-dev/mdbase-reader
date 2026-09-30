import { annotationSourceReference } from "./annotation-source.js";
import { outcomeValue, recordPathById } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { QueryRecord } from "@mdbase-dev/connect";
import type { ReaderRequestOptions, SourceId } from "@mdbase-reader/core";

/** Filter Reader's persisted source references before transferring annotation metadata. */
export async function annotationPathsForSource(
  client: ReaderConnectClient,
  source: SourceId,
  options: ReaderRequestOptions,
): Promise<string[]> {
  // Never infer identity from a filename: sources can be renamed independently of their IDs.
  const path = await recordPathById(client, source, options);
  const [linked, legacy] = await Promise.all([
    // mdbase resolves each link however it is written, so only the target is compared.
    path
      ? annotationPaths(
          client,
          `source != null && source.asFile() != null && source.asFile().file.path == ${JSON.stringify(path)}`,
          options,
        )
      : Promise.resolve([]),
    // A legacy bare ID resolves to no record where the collection configures no ID field.
    annotationPaths(
      client,
      `source != null && source.asFile() == null && source.contains(${JSON.stringify(source)})`,
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

async function annotationPaths(
  client: ReaderConnectClient,
  where: string,
  options: ReaderRequestOptions,
  accept: (record: QueryRecord) => boolean = () => true,
): Promise<string[]> {
  const paths: string[] = [];
  for await (const outcome of client.queryPages(
    { types: ["reader-annotation"], where, frontmatterMode: "effective" },
    { ...options, firstPageSize: 100, pageSize: 100 },
  )) {
    for (const record of outcomeValue(outcome, "find source annotations").results) {
      if (accept(record)) {
        paths.push(record.path);
      }
    }
  }
  return paths;
}

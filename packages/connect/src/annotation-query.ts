import { annotationSourcePath, annotationSourceReference } from "./annotation-source.js";
import { outcomeValue, recordPathById } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ReaderRequestOptions, SourceId } from "@mdbase-reader/core";

/** Filter Reader's persisted source references before transferring annotation metadata. */
export async function annotationPathsForSource(
  client: ReaderConnectClient,
  source: SourceId,
  options: ReaderRequestOptions,
): Promise<string[]> {
  // Never infer identity from a filename: sources can be renamed independently of their IDs.
  const path = await recordPathById(client, source, options);
  const references = [source, ...(path ? [path.replace(/\.md$/u, "")] : [])];
  const where = `source != null && (${references.map((ref) => `source.contains(${JSON.stringify(ref)})`).join(" || ")})`;
  const paths: string[] = [];
  for await (const outcome of client.queryPages(
    { types: ["reader-annotation"], where, frontmatterMode: "effective" },
    { ...options, firstPageSize: 100, pageSize: 100 },
  )) {
    for (const record of outcomeValue(outcome, "find source annotations").results) {
      const ref = annotationSourceReference(
        (record.effectiveFrontmatter ?? record.frontmatter)?.["source"],
      );
      // contains() is only a candidate filter; aliases and prefix collisions must not match.
      if (ref === source || (ref && path && annotationSourcePath(ref) === path)) {
        paths.push(record.path);
      }
    }
  }
  return paths;
}

import { annotationSourcePages } from "./annotation-source-pages.js";
import { outcomeValue } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ReadManyRecord } from "@mdbase-dev/connect";
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

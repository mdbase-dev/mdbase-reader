import { isMdbaseError } from "@mdbase-dev/sdk";

import { annotationSourcePages } from "./annotation-source-pages.js";
import { annotationSourceReference } from "./annotation-source.js";
import {
  completeReaderPages,
  mapConcurrent,
  readerConnectBulkConcurrency,
  recordPathById,
} from "./repository-client.js";

import type { MdbaseClient, Query, RecordView } from "@mdbase-dev/sdk";
import type { ReaderRequestOptions, SourceId } from "@mdbase-reader/core";

/** Filter Reader's persisted source references before transferring annotation metadata. */
export async function annotationPathsForSource(
  client: MdbaseClient,
  source: SourceId,
  options: ReaderRequestOptions,
): Promise<string[]> {
  return [...(await annotationCandidatesForSource(client, source, options)).keys()];
}

export async function annotationCandidatesForSource(
  client: MdbaseClient,
  source: SourceId,
  options: ReaderRequestOptions,
): Promise<Map<string, unknown>> {
  try {
    const path = await recordPathById(client, source, options);
    const [linked, legacy] = await Promise.all([
      path
        ? sourceAnnotationRecords(
            client,
            `has(record.source) && source != null && source.asFile() != null && source.asFile().file.path == ${JSON.stringify(path)}`,
            options,
          )
        : [],
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
    if (!(isMdbaseError(error) && error.reason === "query_budget_exceeded")) {
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
  client: MdbaseClient,
  where: string,
  options: ReaderRequestOptions,
): Promise<RecordView[]> {
  const input: Query = {
    types: ["reader-annotation"],
    where,
  };

  const pages = completeReaderPages(
    client,
    { ...input, select: ["source"] },
    { ...options, include: { effective: true } },
  );
  const records: RecordView[] = [];
  for await (const outcome of pages) {
    records.push(...outcome.records);
  }
  return records;
}

function sourceValue(record: RecordView): unknown {
  return (record.effective ?? record.frontmatter)["source"];
}

/**
 * The full query records (body and both frontmatter forms) at `paths`, keyed by path.
 * Hosted collections evaluate link-following filters from projections and refuse exact
 * output for them, so bodies are fetched here by path, with a filter that follows no links.
 */
export async function annotationRecordsAt(
  client: MdbaseClient,
  paths: readonly string[],
  options: ReaderRequestOptions,
): Promise<Map<string, RecordView>> {
  const records = await mapConcurrent([...new Set(paths)], readerConnectBulkConcurrency, (path) =>
    client.find(
      { path },
      {
        include: { effective: true, body: true, document: true },
        ...(options.signal ? { signal: options.signal } : {}),
      },
    ),
  );
  return new Map(
    records.flatMap((record) =>
      record?.types.includes("reader-annotation") ? [[record.path, record] as const] : [],
    ),
  );
}

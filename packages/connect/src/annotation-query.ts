import { annotationSourceValue, legacySourceId } from "./annotation-source.js";
import {
  backlinksTo,
  completeReaderPages,
  mapConcurrent,
  readerConnectBulkConcurrency,
  recordPathById,
} from "./repository-client.js";

import type { MdbaseClient, RecordView } from "@mdbase-dev/sdk";
import type { ReaderRequestOptions, SourceId } from "@mdbase-reader/core";

const wholeAnnotation = { effective: true, body: true, document: true } as const;

/**
 * One source's annotations, read whole and keyed by path: the records whose `source` link
 * resolves to the source, from the replica's link index, and older ones naming it by bare ID.
 * A link-following query is bounded by collection size and refuses past 1000 records; the
 * link index answers in proportion to the links it finds.
 */
export async function sourceAnnotations(
  client: MdbaseClient,
  source: SourceId,
  options: ReaderRequestOptions,
): Promise<Map<string, RecordView>> {
  const signal = options.signal ? { signal: options.signal } : {};
  const path = await recordPathById(client, source, options);
  const [linked, legacy] = await Promise.all([
    path ? backlinksTo(client, path, { ...signal, include: wholeAnnotation }) : [],
    legacySourceAnnotations(client, source, options),
  ]);
  const records = new Map<string, RecordView>();
  for (const { record, links } of linked) {
    if (
      record.types.includes("reader-annotation") &&
      links.some(({ field }) => field === "source")
    ) {
      records.set(record.path, record);
    }
  }
  // A bare reference is taken as the ID it was written as (`legacySourceId`); the link
  // index holds only links that resolve, so these are never among the backlinks.
  for (const record of legacy) {
    if (!records.has(record.path) && legacySourceId(annotationSourceValue(record)) === source) {
      records.set(record.path, record);
    }
  }
  return records;
}

/** Plain text filtering follows no links, so the query stays within its budget. */
async function legacySourceAnnotations(
  client: MdbaseClient,
  source: SourceId,
  options: ReaderRequestOptions,
): Promise<RecordView[]> {
  const records: RecordView[] = [];
  for await (const page of completeReaderPages(
    client,
    {
      types: ["reader-annotation"],
      where: `has(record.source) && source != null && source.contains(${JSON.stringify(source)})`,
      limit: 100,
    },
    { include: wholeAnnotation, ...(options.signal ? { signal: options.signal } : {}) },
  )) {
    records.push(...page.records);
  }
  return records;
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

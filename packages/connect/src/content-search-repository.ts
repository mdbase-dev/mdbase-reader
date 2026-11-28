import {
  sourceId,
  type CollectionId,
  type SourceId,
  type ContentSearchRepository,
  type ReaderRequestOptions,
  type SourceTextMatchKind,
  type SourceTextSearchMatch,
} from "@mdbase-reader/core";

import {
  annotationSourceValue,
  resolveAnnotationSources,
  type AnnotationLinkTargets,
} from "./annotation-source.js";
import { completeReaderPages } from "./repository-client.js";

import type { MdbaseClient, Query, RecordView } from "@mdbase-dev/sdk";

interface SourceMatches {
  readonly sourceId: SourceId;
  readonly kinds: SourceTextMatchKind[];
  passages?: NonNullable<SourceTextSearchMatch["passages"]>[number][];
}

export class ConnectContentSearchRepository implements ContentSearchRepository {
  constructor(private readonly client: MdbaseClient) {}

  async search(
    _collectionId: CollectionId,
    query: string,
    options: ReaderRequestOptions = {},
  ): Promise<readonly SourceTextSearchMatch[]> {
    // Match the locale-independent lower() the query applies to record text.
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }
    const matches = new Map<string, SourceMatches>();
    const sourceIds = new Map<string, SourceId | undefined>();
    const linksByFolder: AnnotationLinkTargets = new Map();
    for await (const outcome of completeReaderPages(this.client, searchInput(normalized), {
      ...options,
      include: { effective: true, body: true },
    })) {
      const records = outcome.records;
      let references: { path: string; reference: unknown }[] | undefined;
      for (const record of records) {
        if (isAnnotationRecord(record)) {
          (references ??= []).push({ path: record.path, reference: annotationSourceValue(record) });
        }
      }
      options.signal?.throwIfAborted();
      const owners = references
        ? await resolveAnnotationSources(this.client, references, options, sourceIds, linksByFolder)
        : undefined;
      options.signal?.throwIfAborted();
      for (const record of records) {
        appendRecord(matches, sourceIds, owners, record, normalized);
      }
    }
    return [...matches.values()];
  }
}

function appendRecord(
  matches: Map<string, SourceMatches>,
  sourceIds: Map<string, SourceId | undefined>,
  owners: ReadonlyMap<string, string | undefined> | undefined,
  record: RecordView,
  normalized: string,
): void {
  const frontmatter = record.effective ?? record.frontmatter;
  const isNote = frontmatter["type"] === "reader-source" || record.types.includes("reader-source");
  const kind = isNote ? "source-note" : "annotation";
  const id = isNote ? frontmatter["id"] : owners?.get(record.path);
  if (typeof id !== "string" || !id) {
    return;
  }
  let entry = matches.get(id);
  if (!entry) {
    entry = { sourceId: sourceId(id), kinds: [kind] };
    matches.set(id, entry);
  } else if (!entry.kinds.includes(kind)) {
    entry.kinds.push(kind);
  }
  if (isNote) {
    // A later page can resolve a link to this path without a second SDK read.
    sourceIds.set(record.path, entry.sourceId);
  }
  appendPassage(entry, record, kind, normalized);
}

function appendPassage(
  entry: SourceMatches,
  record: RecordView,
  kind: SourceTextMatchKind,
  normalized: string,
): void {
  if ((entry.passages?.length ?? 0) < 3 && typeof record.body === "string") {
    const index = record.body.toLowerCase().indexOf(normalized);
    if (index >= 0) {
      (entry.passages ??= []).push({
        kind,
        path: record.path,
        text: record.body.slice(Math.max(0, index - 100), index + normalized.length + 150),
      });
    }
  }
}

function searchInput(query: string): Query {
  return {
    types: ["reader-source", "reader-annotation"],
    where: `file.body.lower().contains(${JSON.stringify(query)})`,
  };
}

function isAnnotationRecord(record: RecordView): boolean {
  return (
    (record.effective ?? record.frontmatter)["type"] === "reader-annotation" ||
    record.types.includes("reader-annotation")
  );
}

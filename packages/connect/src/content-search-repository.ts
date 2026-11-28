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
    // Most note-only searches never need a link index. Keep the path and ID pairs
    // until a page actually has links to resolve, without retaining record bodies.
    const notePaths: string[] = [];
    const noteIds: SourceId[] = [];
    let sourceIds: Map<string, SourceId | undefined> | undefined;
    let linksByFolder: AnnotationLinkTargets | undefined;
    let occurrences: Map<string, string> | undefined;
    const rememberSource = (path: string, id: SourceId): void => {
      if (sourceIds) {
        sourceIds.set(path, id);
      } else {
        notePaths.push(path);
        noteIds.push(id);
      }
    };
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
      let owners: ReadonlyMap<string, string | undefined> | undefined;
      if (references) {
        if (!sourceIds) {
          sourceIds = new Map();
          for (const [index, path] of notePaths.entries()) {
            sourceIds.set(path, noteIds[index]);
          }
          notePaths.length = 0;
          noteIds.length = 0;
        }
        linksByFolder ??= new Map();
        owners = await resolveAnnotationSources(
          this.client,
          references,
          options,
          sourceIds,
          linksByFolder,
          (occurrences ??= new Map<string, string>()),
        );
      }
      options.signal?.throwIfAborted();
      for (const record of records) {
        appendRecord(matches, rememberSource, owners, record, normalized);
      }
    }
    return [...matches.values()];
  }
}

function appendRecord(
  matches: Map<string, SourceMatches>,
  rememberSource: (path: string, id: SourceId) => void,
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
    rememberSource(record.path, entry.sourceId);
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

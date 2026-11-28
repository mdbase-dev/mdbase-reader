import {
  sourceId,
  type CollectionId,
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
  readonly kinds: Set<SourceTextMatchKind>;
  readonly passages: NonNullable<SourceTextSearchMatch["passages"]>[number][];
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
    const sourceIds = new Map<string, string | undefined>();
    const linksByFolder: AnnotationLinkTargets = new Map();
    for await (const outcome of completeReaderPages(this.client, searchInput(normalized), {
      ...options,
      include: { effective: true, body: true },
    })) {
      const records = outcome.records;
      const references = records.filter(isAnnotationRecord).map((record) => ({
        path: record.path,
        reference: annotationSourceValue(record),
      }));
      options.signal?.throwIfAborted();
      const owners = await resolveAnnotationSources(
        this.client,
        references,
        options,
        sourceIds,
        linksByFolder,
      );
      options.signal?.throwIfAborted();
      for (const record of records) {
        const match = recordMatch(record, owners);
        if (!match) {
          continue;
        }
        let entry = matches.get(match.id);
        if (!entry) {
          entry = { kinds: new Set(), passages: [] };
          matches.set(match.id, entry);
        }
        entry.kinds.add(match.kind);
        if (entry.passages.length < 3 && typeof record.body === "string") {
          const index = record.body.toLowerCase().indexOf(normalized);
          if (index >= 0) {
            entry.passages.push({
              kind: match.kind,
              path: record.path,
              text: record.body.slice(Math.max(0, index - 100), index + normalized.length + 150),
            });
          }
        }
      }
    }
    return [...matches].map(([id, { kinds, passages }]) => ({
      sourceId: sourceId(id),
      kinds: [...kinds],
      ...(passages.length ? { passages } : {}),
    }));
  }
}

function searchInput(query: string): Query {
  return {
    types: ["reader-source", "reader-annotation"],
    where: `file.body.lower().contains(${JSON.stringify(query)})`,
  };
}

function recordMatch(
  record: RecordView,
  owners: ReadonlyMap<string, string | undefined>,
): { readonly id: string; readonly kind: SourceTextMatchKind } | null {
  const frontmatter = record.effective ?? record.frontmatter;
  const declaredType = frontmatter["type"];
  if (declaredType === "reader-source" || record.types.includes("reader-source")) {
    const id = frontmatter["id"];
    return typeof id === "string" && id ? { id, kind: "source-note" } : null;
  }
  const id = owners.get(record.path);
  return id ? { id, kind: "annotation" } : null;
}

function isAnnotationRecord(record: RecordView): boolean {
  return (
    (record.effective ?? record.frontmatter)["type"] === "reader-annotation" ||
    record.types.includes("reader-annotation")
  );
}

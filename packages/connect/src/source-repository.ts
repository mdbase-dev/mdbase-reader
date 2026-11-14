import { isMdbaseError } from "@mdbase-dev/sdk";
import {
  bodyEmbedsAnnotation,
  filterSources,
  recordRevision,
  type AnnotationId,
  type CollectionId,
  type MutationId,
  type Page,
  type ReaderRequestOptions,
  type Source,
  type SourceDeletionPlan,
  type SourceFieldChange,
  type SourceId,
  type SourceQuery,
  type SourceRepository,
  type SourceSummary,
  type SourcePartChain,
} from "@mdbase-reader/core";

import { sourceContract } from "./contracts.js";
import {
  sourceSummaryFromContract,
  sourceFromDocument,
  sourceSummaryFromQuery,
} from "./mapping.js";
import { readingPatch, writeReadingStatus, type ReadingStatusChange } from "./reading-status.js";
import {
  requireCompleteQuery,
  completeReaderPages,
  preflightDeleteRecord,
  deleteRecord,
  updateRecord,
  ConnectRepositoryError,
  recordPathById,
} from "./repository-client.js";
import { writeSourceCitation } from "./source-citation.js";
import { writeSourceFields } from "./source-fields.js";
import * as lookups from "./source-lookups.js";
import {
  withResolvedSourceParts,
  sourcePartsWhere,
  resolveSourceSummaryParts,
} from "./source-part-links.js";
import {
  checkSourcePartChain,
  resolvedSource,
  writeDocumentRange,
  writeSourcePartOf,
} from "./source-parts.js";

import type { CreateFollowThrough } from "./create-follow-through.js";
import type { JsonObject, MdbaseClient, RecordView, wire } from "@mdbase-dev/sdk";

export class ConnectSourceRepository implements SourceRepository {
  readonly #deletePreflights = new Map<string, wire.Preflight>();

  constructor(
    private readonly client: MdbaseClient,
    /** Told of removals, so a create still waiting for the collection is let go of. */
    private readonly creates?: Pick<CreateFollowThrough, "forget">,
  ) {}

  async list(query: SourceQuery, options: ReaderRequestOptions = {}): Promise<Page<SourceSummary>> {
    const result = await this.client.queryContract(sourceContract, {
      pageSize: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    requireCompleteQuery(result.page);
    const records = result.records.map((record) =>
      sourceSummaryFromContract(query.collectionId, record, result.page.records),
    );
    const items = await resolveSourceSummaryParts(
      this.client,
      filterSources(records, query.search),
      options,
    );
    const cursor = result.page.cursor;
    return {
      items,
      ...(cursor !== undefined ? { nextCursor: cursor } : {}),
      ...(typeof result.page.totalCount === "number" ? { totalCount: result.page.totalCount } : {}),
    };
  }

  async *listPages(
    query: Omit<SourceQuery, "cursor">,
    options: ReaderRequestOptions = {},
  ): AsyncIterable<Page<SourceSummary>> {
    let cursor: string | undefined;
    do {
      const result = await this.client.queryContract(sourceContract, {
        pageSize: 128,
        ...(cursor ? { cursor } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      });
      requireCompleteQuery(result.page);
      const summaries = result.records
        .map((record) => sourceSummaryFromContract(query.collectionId, record, result.page.records))
        .filter(
          (source) =>
            query.readingStatus === undefined || source.readingStatus === query.readingStatus,
        );
      const items = await resolveSourceSummaryParts(
        this.client,
        filterSources(summaries, query.search),
        options,
      );
      cursor = result.page.cursor;
      yield {
        items,
        ...(cursor ? { nextCursor: cursor } : {}),
        ...(result.page.totalCount === undefined ? {} : { totalCount: result.page.totalCount }),
      };
    } while (cursor);
  }

  async sourceParts(
    collection: CollectionId,
    id: SourceId,
    options: ReaderRequestOptions = {},
  ): Promise<readonly SourceSummary[]> {
    const records: SourceSummary[] = [];
    for await (const outcome of completeReaderPages(
      this.client,
      withResolvedSourceParts({
        types: ["reader-source"],
        where: sourcePartsWhere(id),
      }),
      options,
    )) {
      records.push(...outcome.records.map((record) => sourceSummaryFromQuery(collection, record)));
    }
    return records;
  }

  validatePartOf(collection: CollectionId, id: SourceId): Promise<SourcePartChain> {
    return checkSourcePartChain(this, collection, id);
  }

  setSourcePartOf(
    input: Parameters<NonNullable<SourceRepository["setSourcePartOf"]>>[0],
  ): Promise<Source> {
    return writeSourcePartOf(this.client, this, input);
  }

  setDocumentRange(
    input: Parameters<NonNullable<SourceRepository["setDocumentRange"]>>[0],
  ): Promise<Source> {
    return writeDocumentRange(this.client, this, input);
  }

  readonly findByUrl: NonNullable<SourceRepository["findByUrl"]> = (collectionId, url, options) =>
    lookups.findSourceByUrl(this.#query(collectionId, options), url);

  readonly findByCitekeyPrefix: NonNullable<SourceRepository["findByCitekeyPrefix"]> = (id, p, o) =>
    lookups.findSourcesByCitekeyPrefix(this.#query(id, o), p);

  async get(
    collection: CollectionId,
    id: SourceId,
    options: ReaderRequestOptions = {},
  ): Promise<Source | null> {
    const path = await recordPathById(this.client, id, options);
    if (!path) {
      return null;
    }
    const result = await this.client.get(
      { path: path },
      { ...options, include: { effective: true, body: true, document: true } },
    );
    return await resolvedSource(this.client, sourceFromDocument(collection, result), options);
  }

  async updateBody(input: {
    readonly collectionId: CollectionId;
    readonly sourceId: SourceId;
    readonly expectedRevision: ReturnType<typeof recordRevision>;
    readonly body: string;
  }): Promise<Source> {
    const path = await this.#path(input.sourceId, "update source note");
    const updated = await updateRecord(
      this.client,
      { path: path },
      { ifRevision: input.expectedRevision, patch: {}, body: input.body },
    );
    return await resolvedSource(this.client, sourceFromDocument(input.collectionId, updated));
  }

  async updateReading(input: Parameters<SourceRepository["updateReading"]>[0]): Promise<Source> {
    const path = await this.#path(input.sourceId, "save reading position");
    if (input.expectedFrontmatter) {
      // The caller's revision is usually current, so try it before paying for a fresh read.
      try {
        const record = await updateRecord(
          this.client,
          { path },
          {
            ifRevision: input.expectedRevision,
            patch: {
              reading: readingPatch(input.expectedFrontmatter, input) as JsonObject,
            },
          },
        );
        return await resolvedSource(this.client, sourceFromDocument(input.collectionId, record));
      } catch (error) {
        if (!isMdbaseError(error, "conflict")) {
          throw error;
        }
      }
    }
    const current = await this.client.get(
      { path: path },
      { include: { effective: true, body: true, document: true } },
    );
    const updated = await updateRecord(
      this.client,
      { path: path },
      {
        ifRevision: recordRevision(current.revision),
        patch: {
          reading: readingPatch(current.frontmatter, input) as JsonObject,
        },
      },
    );
    return await resolvedSource(this.client, sourceFromDocument(input.collectionId, updated));
  }

  async updateReadingStatus(input: ReadingStatusChange): Promise<Source> {
    const path = await this.#path(input.sourceId, "change reading status");
    return await resolvedSource(this.client, await writeReadingStatus(this.client, path, input));
  }

  async updateFields(input: SourceFieldChange): Promise<Source> {
    const path = await this.#path(input.sourceId, "edit source fields");
    return await resolvedSource(this.client, await writeSourceFields(this.client, path, input));
  }

  async updateCitation(input: Parameters<SourceRepository["updateCitation"]>[0]): Promise<Source> {
    const path = await this.#path(input.sourceId, "save citation metadata");
    return await resolvedSource(this.client, await writeSourceCitation(this.client, path, input));
  }

  async appendAnnotationEmbed(input: {
    readonly collectionId: CollectionId;
    readonly sourceId: SourceId;
    readonly expectedRevision: ReturnType<typeof recordRevision>;
    readonly annotationId: AnnotationId;
    readonly embed: string;
    readonly idempotencyKey: MutationId;
  }): Promise<ReturnType<typeof recordRevision>> {
    const path = await this.#path(input.sourceId, "append annotation");
    const current = await this.client.get(
      { path: path },
      { include: { effective: true, body: true, document: true } },
    );
    const body = current.body ?? "";
    // The embed may already be written another way, such as by filename alone.
    const target = /^!\[\[([^\]]+)\]\]$/u.exec(input.embed)?.[1];
    if (target ? bodyEmbedsAnnotation(body, target) : body.includes(input.embed)) {
      return recordRevision(current.revision);
    }
    const separator = body.length === 0 || body.endsWith("\n") ? "" : "\n";
    const updated = await updateRecord(
      this.client,
      { path: path },
      {
        ifRevision: input.expectedRevision,
        patch: {},
        body: `${body}${separator}\n${input.embed}\n`,
      },
    );
    return recordRevision(updated.revision);
  }

  async preflightDelete(source: Source): Promise<SourceDeletionPlan> {
    const result = await preflightDeleteRecord(
      this.client,
      { path: source.path },
      source.recordRevision,
    );
    this.#deletePreflights.set(deletionKey(source.path, source.recordRevision), result);
    return {
      sourceId: source.id,
      path: source.path,
      expectedRevision: source.recordRevision,
      brokenLinkPaths: [...new Set(result.broken.map(({ path }) => path))].sort((left, right) =>
        left.localeCompare(right),
      ),
    };
  }

  /** Deletes the source record only; its stored files and annotation records are left as is. */
  async delete(plan: SourceDeletionPlan): Promise<void> {
    const key = deletionKey(plan.path, plan.expectedRevision);
    const preflight = this.#deletePreflights.get(key);
    if (!preflight) {
      throw new Error("Source removal requires a current preflight confirmation.");
    }
    try {
      await deleteRecord(this.client, { path: plan.path }, plan.expectedRevision, preflight);
      await this.creates?.forget(plan.sourceId);
    } finally {
      this.#deletePreflights.delete(key);
    }
  }

  async #path(id: SourceId, operation: string): Promise<string> {
    const path = await recordPathById(this.client, id);
    if (!path) {
      throw new ConnectRepositoryError(operation, "source_not_found");
    }
    return path;
  }

  /** Runs a filtered query over Reader's own records. */
  #query(collectionId: CollectionId, options: ReaderRequestOptions = {}): lookups.SourceWhere {
    return async (where) => {
      const records = await lookups.queryReaderSources(this.client, where, options);
      return this.#sourceItems({ collectionId, limit: records.length }, records);
    };
  }

  #sourceItems(
    query: Omit<SourceQuery, "cursor">,
    records: readonly RecordView[],
  ): SourceSummary[] {
    const sources = records
      .map((record) => sourceSummaryFromQuery(query.collectionId, record))
      .filter(
        (source) =>
          query.readingStatus === undefined || source.readingStatus === query.readingStatus,
      );
    return [...filterSources(sources, query.search)];
  }
}

function deletionKey(path: string, revision: string): string {
  return `${path}\n${revision}`;
}

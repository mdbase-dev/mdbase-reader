import {
  bodyEmbedsAnnotation,
  cslProblemSummary,
  cslProvenanceKey,
  filterSources,
  recordRevision,
  validateCslItem,
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
} from "@mdbase-reader/core";

import { sourceContract } from "./contracts.js";
import { sourceFromDocument, sourceSummaryFromQuery } from "./mapping.js";
import { readingPatch, writeReadingStatus, type ReadingStatusChange } from "./reading-status.js";
import {
  ConnectRepositoryError,
  outcomeValue,
  queryWithOptions,
  readWithOptions,
  recordPathById,
} from "./repository-client.js";
import { writeSourceFields } from "./source-fields.js";
import * as lookups from "./source-lookups.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { DeletePreflightResult, QueryRecord } from "@mdbase-dev/connect";

export class ConnectSourceRepository implements SourceRepository {
  readonly #deletePreflights = new Map<string, DeletePreflightResult>();

  constructor(private readonly client: ReaderConnectClient) {}

  async list(query: SourceQuery, options: ReaderRequestOptions = {}): Promise<Page<SourceSummary>> {
    const parsedOffset = Number.parseInt(query.cursor ?? "", 10);
    const offset = Number.isSafeInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
    const result = outcomeValue(
      await queryWithOptions(
        this.client,
        {
          contract: sourceContract,
          frontmatterMode: "effective",
          limit: query.limit,
          offset,
        },
        options,
      ),
      "query sources",
    );
    const items = this.#sourceItems(query, result.results);
    const hasMore = result.meta?.hasMore ?? false;
    return {
      items,
      ...(hasMore ? { nextCursor: String(offset + result.results.length) } : {}),
      ...(typeof result.meta?.totalCount === "number"
        ? { totalCount: result.meta.totalCount }
        : {}),
    };
  }

  async *listPages(
    query: Omit<SourceQuery, "cursor">,
    options: ReaderRequestOptions = {},
  ): AsyncIterable<Page<SourceSummary>> {
    for await (const outcome of this.client.queryPages(
      {
        contract: sourceContract,
        frontmatterMode: "effective",
      },
      {
        ...options,
        pageSize: 1_000,
      },
    )) {
      const page = outcomeValue(outcome, "query sources");
      const items = this.#sourceItems(query, page.results);
      yield {
        items,
        ...(page.cursor ? { nextCursor: page.cursor } : {}),
        ...(typeof page.meta?.totalCount === "number" ? { totalCount: page.meta.totalCount } : {}),
      };
    }
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
    const result = outcomeValue(
      await readWithOptions(this.client, { path, includeDocument: true }, options),
      "read source",
    );
    return sourceFromDocument(collection, result);
  }

  async updateBody(input: {
    readonly collectionId: CollectionId;
    readonly sourceId: SourceId;
    readonly expectedRevision: ReturnType<typeof recordRevision>;
    readonly body: string;
  }): Promise<Source> {
    const path = await this.#path(input.sourceId, "update source note");
    const updated = outcomeValue(
      await this.client.update({
        path,
        ifRevision: input.expectedRevision,
        patch: {},
        body: input.body,
      }),
      "update source note",
    );
    return sourceFromDocument(input.collectionId, updated);
  }

  async updateReading(input: Parameters<SourceRepository["updateReading"]>[0]): Promise<Source> {
    const path = await this.#path(input.sourceId, "save reading position");
    if (input.expectedFrontmatter) {
      // The caller's revision is usually current, so try it before paying for a fresh read.
      const outcome = await this.client.update({
        path,
        ifRevision: input.expectedRevision,
        patch: { reading: readingPatch(input.expectedFrontmatter, input) },
        includeDocument: true,
      });
      if (outcome.ok) {
        return sourceFromDocument(input.collectionId, outcome.value);
      }
      // Authorities report a moved-on record in more than one way, so any refusal rebases on a
      // fresh read below; a lasting failure surfaces from that read or write instead.
    }
    const current = outcomeValue(
      await this.client.read({ path, includeDocument: true }),
      "read source before saving position",
    );
    const updated = outcomeValue(
      await this.client.update({
        path,
        ifRevision: recordRevision(current.revision),
        patch: { reading: readingPatch(current.frontmatter, input) },
        includeDocument: true,
      }),
      "save reading position",
    );
    return sourceFromDocument(input.collectionId, updated);
  }

  async updateReadingStatus(input: ReadingStatusChange): Promise<Source> {
    const path = await this.#path(input.sourceId, "change reading status");
    return writeReadingStatus(this.client, path, input);
  }

  async updateFields(input: SourceFieldChange): Promise<Source> {
    const path = await this.#path(input.sourceId, "edit source fields");
    return writeSourceFields(this.client, path, input);
  }

  async updateCitation(input: Parameters<SourceRepository["updateCitation"]>[0]): Promise<Source> {
    const validation = validateCslItem(input.citation);
    if (!validation.valid) {
      throw new ConnectRepositoryError(
        "save citation metadata",
        cslProblemSummary(validation.problems),
      );
    }
    const path = await this.#path(input.sourceId, "save citation metadata");
    const updated = outcomeValue(
      await this.client.update({
        path,
        // A citation save only replaces `csl`. Checking the revision the editor loaded would
        // refuse it after any unrelated write, such as a reading position.
        patch: {
          csl: validation.item,
          ...(input.provenance !== undefined
            ? {
                [cslProvenanceKey]:
                  Object.keys(input.provenance).length > 0 ? input.provenance : null,
              }
            : {}),
        },
        includeDocument: true,
      }),
      "save citation metadata",
    );
    return sourceFromDocument(input.collectionId, updated);
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
    const current = outcomeValue(
      await this.client.read({ path, includeDocument: true }),
      "read source before annotation",
    );
    const body = current.body ?? "";
    // The embed may already be written another way, such as by filename alone.
    const target = /^!\[\[([^\]]+)\]\]$/u.exec(input.embed)?.[1];
    if (target ? bodyEmbedsAnnotation(body, target) : body.includes(input.embed)) {
      return recordRevision(current.revision);
    }
    const separator = body.length === 0 || body.endsWith("\n") ? "" : "\n";
    const updated = outcomeValue(
      await this.client.update({
        path,
        ifRevision: input.expectedRevision,
        patch: {},
        body: `${body}${separator}\n${input.embed}\n`,
      }),
      "append annotation",
    );
    return recordRevision(updated.revision);
  }

  async preflightDelete(source: Source): Promise<SourceDeletionPlan> {
    const result = outcomeValue(
      await this.client.preflightDelete({ path: source.path, ifRevision: source.recordRevision }),
      "check source removal",
    );
    this.#deletePreflights.set(deletionKey(source.path, source.recordRevision), result);
    return {
      sourceId: source.id,
      path: source.path,
      expectedRevision: source.recordRevision,
      brokenLinkPaths: [...new Set(result.brokenLinks?.map(({ path }) => path) ?? [])].sort(
        (left, right) => left.localeCompare(right),
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
      const result = outcomeValue(
        await this.client.deleteWithProgress(
          { path: plan.path, ifRevision: plan.expectedRevision, checkBacklinks: true },
          { preflight },
        ),
        "remove source",
      );
      if (!result.deleted) {
        throw new Error(`mdbase Connect did not remove source ${plan.sourceId}.`);
      }
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
    records: readonly QueryRecord[],
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

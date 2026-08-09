import {
  cslProblemSummary,
  recordRevision,
  validateCslItem,
  type AnnotationId,
  type CollectionId,
  type MutationId,
  type Page,
  type ReaderRequestOptions,
  type ReadingPosition,
  type Source,
  type SourceId,
  type SourceQuery,
  type SourceRepository,
  type SourceSummary,
} from "@mdbase-reader/core";

import { sourceContract } from "./contracts.js";
import { sourceFromDocument, sourceSummaryFromQuery } from "./mapping.js";
import {
  ConnectRepositoryError,
  cursorOffset,
  outcomeValue,
  queryWithOptions,
  readWithOptions,
  recordPathById,
} from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";

export class ConnectSourceRepository implements SourceRepository {
  readonly #pathsById = new Map<string, string>();

  constructor(private readonly client: ReaderConnectClient) {}

  async list(query: SourceQuery, options: ReaderRequestOptions = {}): Promise<Page<SourceSummary>> {
    const offset = cursorOffset(query.cursor);
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
    const items = result.results
      .map((record) => sourceSummaryFromQuery(query.collectionId, record))
      .map((source) => {
        this.#pathsById.set(source.id, source.path);
        return source;
      })
      .filter(
        (source) =>
          query.readingStatus === undefined || source.readingStatus === query.readingStatus,
      )
      .filter((source) => matchesSearch(source, query.search));
    const hasMore = result.meta?.hasMore ?? false;
    return {
      items,
      ...(hasMore ? { nextCursor: String(offset + result.results.length) } : {}),
      ...(typeof result.meta?.totalCount === "number"
        ? { totalCount: result.meta.totalCount }
        : {}),
    };
  }

  async get(
    collection: CollectionId,
    id: SourceId,
    options: ReaderRequestOptions = {},
  ): Promise<Source | null> {
    const path =
      this.#pathsById.get(id) ?? (await recordPathById(this.client, sourceContract, id, options));
    if (!path) {
      return null;
    }
    this.#pathsById.set(id, path);
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

  async updateReading(input: {
    readonly collectionId: CollectionId;
    readonly sourceId: SourceId;
    readonly expectedRevision: ReturnType<typeof recordRevision>;
    readonly documentFileId: Parameters<SourceRepository["updateReading"]>[0]["documentFileId"];
    readonly position: ReadingPosition;
    readonly openedAt: Parameters<SourceRepository["updateReading"]>[0]["openedAt"];
  }): Promise<Source> {
    const path = await this.#path(input.sourceId, "save reading position");
    const current = outcomeValue(
      await this.client.read({ path, includeDocument: true }),
      "read source before saving position",
    );
    const existing = objectValue(current.frontmatter["reading"]);
    const reading = {
      ...existing,
      status: typeof existing["status"] === "string" ? existing["status"] : "reading",
      document_file_id: input.documentFileId,
      position: positionFrontmatter(input.position),
      started_at: existing["started_at"] ?? input.openedAt,
      last_opened_at: input.openedAt,
    };
    const updated = outcomeValue(
      await this.client.update({
        path,
        // Reading position is a mergeable field. Rebase it on the whole record
        // we just read so an earlier autosave or another benign source update
        // cannot strand the session on a stale caller revision.
        ifRevision: recordRevision(current.revision),
        patch: { reading },
        includeDocument: true,
      }),
      "save reading position",
    );
    return sourceFromDocument(input.collectionId, updated);
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
        ifRevision: input.expectedRevision,
        patch: { csl: validation.item },
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
    if (body.includes(input.embed)) {
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

  async #path(id: SourceId, operation: string): Promise<string> {
    const path = this.#pathsById.get(id) ?? (await recordPathById(this.client, sourceContract, id));
    if (!path) {
      throw new ConnectRepositoryError(operation, "source_not_found");
    }
    this.#pathsById.set(id, path);
    return path;
  }
}

function objectValue(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function positionFrontmatter(position: ReadingPosition): Readonly<Record<string, unknown>> {
  if (position.kind === "pdf") {
    return { pdf: { page_index: position.pageIndex } };
  }
  if (position.kind === "epub") {
    return { epub: { locator: position.locator } };
  }
  return {
    html: {
      href: position.href,
      ...(position.progression === undefined ? {} : { progression: position.progression }),
    },
  };
}

function matchesSearch(source: SourceSummary, search: string | undefined): boolean {
  const normalized = search?.trim().toLocaleLowerCase();
  return normalized
    ? [
        source.title,
        ...source.creators,
        ...source.tags,
        source.publication,
        source.site,
        source.published === undefined ? undefined : String(source.published),
      ]
        .filter((value): value is string => value !== undefined)
        .join("\n")
        .toLocaleLowerCase()
        .includes(normalized)
    : true;
}

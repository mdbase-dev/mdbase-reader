import {
  recordRevision,
  type Annotation,
  type AnnotationId,
  type AnnotationRepository,
  type CollectionId,
  type MutationId,
  type Page,
  type ReaderRequestOptions,
  type Source,
  type SourceId,
  type SourceQuery,
  type SourceRepository,
  type SourceSummary,
} from "@mdbase-reader/core";

import { annotationContract, sourceContract } from "./contracts.js";
import {
  annotationFromDocument,
  annotationFrontmatter,
  sourceFromDocument,
  sourceSummaryFromQuery,
} from "./mapping.js";

import type {
  ConnectOutcome,
  CreateInput,
  MdbaseConnection,
  QueryInput,
  QueryResult,
  ReadInput,
  RecordDocument,
  UpdateInput,
} from "@mdbase-dev/connect";

export interface ReaderConnectClient {
  read(input: ReadInput, options?: ReaderRequestOptions): Promise<ConnectOutcome<RecordDocument>>;
  query(input: QueryInput, options?: ReaderRequestOptions): Promise<ConnectOutcome<QueryResult>>;
  create(input: CreateInput): Promise<ConnectOutcome<RecordDocument>>;
  update(input: UpdateInput): Promise<ConnectOutcome<RecordDocument>>;
}

export class ConnectRepositoryError extends Error {
  constructor(operation: string, code: string, detail?: string) {
    super(`mdbase Connect could not ${operation}: ${detail ?? code}`);
    this.name = "ConnectRepositoryError";
  }
}

function value<Value>(outcome: ConnectOutcome<Value>, operation: string): Value {
  if (outcome.ok) {
    return outcome.value;
  }
  throw new ConnectRepositoryError(operation, outcome.problem.code, outcome.problem.message);
}

function cursorOffset(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const offset = Number.parseInt(cursor, 10);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
}

function queryWithOptions(
  client: ReaderConnectClient,
  input: QueryInput,
  options: ReaderRequestOptions,
): Promise<ConnectOutcome<QueryResult>> {
  return options.signal ? client.query(input, options) : client.query(input);
}

function readWithOptions(
  client: ReaderConnectClient,
  input: ReadInput,
  options: ReaderRequestOptions,
): Promise<ConnectOutcome<RecordDocument>> {
  return options.signal ? client.read(input, options) : client.read(input);
}

async function recordPathById(
  client: ReaderConnectClient,
  contract: typeof sourceContract | typeof annotationContract,
  id: string,
  options: ReaderRequestOptions = {},
): Promise<string | null> {
  const result = value(
    await queryWithOptions(client, { contract, frontmatterMode: "effective", limit: 500 }, options),
    "query records",
  );
  return (
    result.results.find(
      ({ effectiveFrontmatter, frontmatter }) =>
        (effectiveFrontmatter ?? frontmatter)?.["id"] === id,
    )?.path ?? null
  );
}

export class ConnectSourceRepository implements SourceRepository {
  readonly #pathsById = new Map<string, string>();

  constructor(private readonly client: ReaderConnectClient) {}

  async list(query: SourceQuery, options: ReaderRequestOptions = {}): Promise<Page<SourceSummary>> {
    const offset = cursorOffset(query.cursor);
    const outcome = await queryWithOptions(
      this.client,
      {
        contract: sourceContract,
        frontmatterMode: "effective",
        limit: query.limit,
        offset,
      },
      options,
    );
    const result = value(outcome, "query sources");
    const normalized = result.results
      .map((record) => sourceSummaryFromQuery(query.collectionId, record))
      .map((source) => {
        this.#pathsById.set(source.id, source.path);
        return source;
      })
      .filter(
        (source) =>
          query.readingStatus === undefined || source.readingStatus === query.readingStatus,
      )
      .filter((source) => {
        const search = query.search?.trim().toLocaleLowerCase();
        return search
          ? [source.title, ...source.creators, ...source.tags]
              .join("\n")
              .toLocaleLowerCase()
              .includes(search)
          : true;
      });
    const hasMore = result.meta?.hasMore ?? false;
    return {
      items: normalized,
      ...(hasMore ? { nextCursor: String(offset + result.results.length) } : {}),
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
    const result = value(
      await readWithOptions(
        this.client,
        { path, contract: sourceContract, includeDocument: true },
        options,
      ),
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
    const path =
      this.#pathsById.get(input.sourceId) ??
      (await recordPathById(this.client, sourceContract, input.sourceId));
    if (!path) {
      throw new ConnectRepositoryError("update source note", "source_not_found");
    }
    this.#pathsById.set(input.sourceId, path);
    const updated = value(
      await this.client.update({
        path,
        contract: sourceContract,
        ifRevision: input.expectedRevision,
        patch: {},
        body: input.body,
      }),
      "update source note",
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
    const path =
      this.#pathsById.get(input.sourceId) ??
      (await recordPathById(this.client, sourceContract, input.sourceId));
    if (!path) {
      throw new ConnectRepositoryError("append annotation", "source_not_found");
    }
    this.#pathsById.set(input.sourceId, path);
    const current = value(
      await this.client.read({ path, contract: sourceContract, includeDocument: true }),
      "read source before annotation",
    );
    const body = current.body ?? "";
    if (body.includes(input.embed)) {
      return recordRevision(current.revision);
    }
    const separator = body.length === 0 || body.endsWith("\n") ? "" : "\n";
    const updated = value(
      await this.client.update({
        path,
        contract: sourceContract,
        ifRevision: input.expectedRevision,
        patch: {},
        body: `${body}${separator}\n${input.embed}\n`,
      }),
      "append annotation",
    );
    return recordRevision(updated.revision);
  }
}

export class ConnectAnnotationRepository implements AnnotationRepository {
  readonly #pathsById = new Map<string, string>();
  readonly #pathsBySource = new Map<string, string[]>();
  #indexPromise: Promise<void> | null = null;

  constructor(private readonly client: ReaderConnectClient) {}

  async listForSource(
    collection: CollectionId,
    source: SourceId,
    options: ReaderRequestOptions = {},
  ): Promise<readonly Annotation[]> {
    await this.#ensureIndex();
    const matchingPaths = this.#pathsBySource.get(source) ?? [];

    return Promise.all(
      matchingPaths.map(async (path) => {
        const document = value(
          await readWithOptions(
            this.client,
            {
              path,
              contract: annotationContract,
              includeDocument: true,
            },
            options,
          ),
          "read annotation",
        );
        return annotationFromDocument(collection, document);
      }),
    );
  }

  async #buildIndex(): Promise<void> {
    let offset = 0;
    let hasMore: boolean;

    do {
      const result = value(
        await this.client.query({
          contract: annotationContract,
          frontmatterMode: "effective",
          limit: 500,
          offset,
        }),
        "query annotations",
      );
      for (const record of result.results) {
        const fields = record.effectiveFrontmatter ?? record.frontmatter;
        const id = stringField(fields?.["id"]);
        const source = linkedRecordId(fields?.["source"]);
        if (!id || !source) {
          continue;
        }
        this.#pathsById.set(id, record.path);
        const paths = this.#pathsBySource.get(source) ?? [];
        paths.push(record.path);
        this.#pathsBySource.set(source, paths);
      }

      hasMore = Boolean(result.meta?.hasMore && result.results.length > 0);
      offset += result.results.length;
    } while (hasMore);
  }

  async #ensureIndex(): Promise<void> {
    this.#indexPromise ??= this.#buildIndex().catch((reason: unknown) => {
      this.#indexPromise = null;
      this.#pathsById.clear();
      this.#pathsBySource.clear();
      throw reason;
    });
    return this.#indexPromise;
  }

  async create(annotation: Annotation, _idempotencyKey: MutationId): Promise<Annotation> {
    const result = value(
      await this.client.create({
        path: `annotations/${annotation.id}.md`,
        type: "reader-annotation",
        contract: annotationContract,
        frontmatter: annotationFrontmatter(annotation),
        body: annotation.body,
        includeDocument: true,
      }),
      "create annotation",
    );
    const created = annotationFromDocument(annotation.collectionId, result);
    this.#pathsById.set(created.id, result.path);
    if (this.#indexPromise) {
      const paths = this.#pathsBySource.get(created.sourceId) ?? [];
      if (!paths.includes(result.path)) {
        paths.push(result.path);
        this.#pathsBySource.set(created.sourceId, paths);
      }
    }
    return created;
  }

  async get(
    collection: CollectionId,
    id: AnnotationId,
    options: ReaderRequestOptions = {},
  ): Promise<Annotation | null> {
    const path =
      this.#pathsById.get(id) ??
      (await recordPathById(this.client, annotationContract, id, options));
    if (!path) {
      return null;
    }
    const result = value(
      await readWithOptions(
        this.client,
        { path, contract: annotationContract, includeDocument: true },
        options,
      ),
      "read annotation",
    );
    return annotationFromDocument(collection, result);
  }
}

function stringField(candidate: unknown): string | undefined {
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : undefined;
}

function linkedRecordId(candidate: unknown): string | undefined {
  const value = stringField(candidate);
  if (!value) {
    return undefined;
  }
  return /^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/u.exec(value)?.[1] ?? value;
}

export function connectClient(connection: MdbaseConnection): ReaderConnectClient {
  return {
    read: (input, options) => connection.read(input, options),
    query: (input, options) => connection.query(input, options),
    create: (input) => connection.create(input),
    update: (input) => connection.update(input),
  };
}

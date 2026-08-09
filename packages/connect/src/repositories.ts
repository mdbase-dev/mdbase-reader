import {
  recordRevision,
  type Annotation,
  type AnnotationId,
  type AnnotationRepository,
  type CollectionId,
  type MutationId,
  type Page,
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
  read(input: ReadInput): Promise<ConnectOutcome<RecordDocument>>;
  query(input: QueryInput): Promise<ConnectOutcome<QueryResult>>;
  create(input: CreateInput): Promise<ConnectOutcome<RecordDocument>>;
  update(input: UpdateInput): Promise<ConnectOutcome<RecordDocument>>;
}

export class ConnectRepositoryError extends Error {
  constructor(operation: string, code: string) {
    super(`mdbase Connect could not ${operation}: ${code}`);
    this.name = "ConnectRepositoryError";
  }
}

function value<Value>(outcome: ConnectOutcome<Value>, operation: string): Value {
  if (outcome.ok) {
    return outcome.value;
  }
  throw new ConnectRepositoryError(operation, outcome.problem.code);
}

function cursorOffset(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const offset = Number.parseInt(cursor, 10);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
}

async function recordPathById(
  client: ReaderConnectClient,
  contract: typeof sourceContract | typeof annotationContract,
  id: string,
): Promise<string | null> {
  const result = value(
    await client.query({ contract, frontmatterMode: "effective", limit: 500 }),
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
  constructor(private readonly client: ReaderConnectClient) {}

  async list(query: SourceQuery): Promise<Page<SourceSummary>> {
    const offset = cursorOffset(query.cursor);
    const outcome = await this.client.query({
      contract: sourceContract,
      frontmatterMode: "effective",
      limit: query.limit,
      offset,
    });
    const result = value(outcome, "query sources");
    const normalized = result.results
      .map((record) => sourceSummaryFromQuery(query.collectionId, record))
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

  async get(collection: CollectionId, id: SourceId): Promise<Source | null> {
    const path = await recordPathById(this.client, sourceContract, id);
    if (!path) {
      return null;
    }
    const result = value(
      await this.client.read({ path, contract: sourceContract, includeDocument: true }),
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
    const path = await recordPathById(this.client, sourceContract, input.sourceId);
    if (!path) {
      throw new ConnectRepositoryError("update source note", "source_not_found");
    }
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
    const path = await recordPathById(this.client, sourceContract, input.sourceId);
    if (!path) {
      throw new ConnectRepositoryError("append annotation", "source_not_found");
    }
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
  constructor(private readonly client: ReaderConnectClient) {}

  async listForSource(collection: CollectionId, source: SourceId): Promise<readonly Annotation[]> {
    const result = value(
      await this.client.query({
        contract: annotationContract,
        frontmatterMode: "both",
        includeBody: true,
        limit: 500,
      }),
      "query annotations",
    );
    return result.results
      .map((record) =>
        annotationFromDocument(collection, {
          path: record.path,
          frontmatter: record.frontmatter ?? {},
          effectiveFrontmatter: record.effectiveFrontmatter ?? record.frontmatter ?? {},
          ...(record.body === undefined ? {} : { body: record.body }),
        }),
      )
      .filter((annotation) => annotation.sourceId === source);
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
    return annotationFromDocument(annotation.collectionId, result);
  }

  async get(collection: CollectionId, id: AnnotationId): Promise<Annotation | null> {
    const path = await recordPathById(this.client, annotationContract, id);
    if (!path) {
      return null;
    }
    const result = value(
      await this.client.read({ path, contract: annotationContract, includeDocument: true }),
      "read annotation",
    );
    return annotationFromDocument(collection, result);
  }
}

export function connectClient(connection: MdbaseConnection): ReaderConnectClient {
  return {
    read: (input) => connection.read(input),
    query: (input) => connection.query(input),
    create: (input) => connection.create(input),
    update: (input) => connection.update(input),
  };
}

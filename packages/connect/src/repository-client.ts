import { readerDiagnostics } from "./diagnostics.js";

import type {
  ConnectOutcome,
  ConnectRequestOptions,
  CreateInput,
  DeleteInput,
  DeletePreflightResult,
  DeleteProgressOptions,
  DeleteResult,
  ConnectProblem,
  MdbaseConnection,
  QueryInput,
  QueryMetadataInput,
  QueryMetadataPage,
  QueryPage,
  QueryResult,
  ReadInput,
  ReadManyOptions,
  ReadManyResult,
  RecordDocument,
  UpdateInput,
} from "@mdbase-dev/connect";
import type { ReaderRequestOptions } from "@mdbase-reader/core";

export const readerConnectBulkConcurrency = 4;

export interface ReaderQueryPagesOptions extends ReaderRequestOptions {
  readonly firstPageSize?: number;
  readonly pageSize?: number;
}

export interface ReaderConnectClient {
  supportsAuthorityFeature(
    id: string,
    options?: ReaderRequestOptions,
  ): Promise<ConnectOutcome<boolean>>;
  read(input: ReadInput, options?: ReaderRequestOptions): Promise<ConnectOutcome<RecordDocument>>;
  readMany(
    paths: readonly string[],
    options?: ReadManyOptions,
  ): Promise<ConnectOutcome<ReadManyResult>>;
  query(input: QueryInput, options?: ReaderRequestOptions): Promise<ConnectOutcome<QueryResult>>;
  queryPages(
    input: QueryMetadataInput,
    options?: ReaderQueryPagesOptions,
  ): AsyncIterable<ConnectOutcome<QueryMetadataPage>>;
  queryPages(
    input: QueryInput,
    options?: ReaderQueryPagesOptions,
  ): AsyncIterable<ConnectOutcome<QueryPage>>;
  create(input: CreateInput): Promise<ConnectOutcome<RecordDocument>>;
  update(input: UpdateInput): Promise<ConnectOutcome<RecordDocument>>;
  preflightDelete(input: DeleteInput): Promise<ConnectOutcome<DeletePreflightResult>>;
  deleteWithProgress(
    input: DeleteInput,
    options?: DeleteProgressOptions,
  ): Promise<ConnectOutcome<DeleteResult>>;
}

export class ConnectRepositoryError extends Error {
  constructor(
    operation: string,
    code: string,
    detail?: string,
    /** The SDK problem, when the failure came from a Connect outcome. */
    readonly problem?: ConnectProblem,
  ) {
    super(`mdbase Connect could not ${operation}: ${detail ?? code}`);
    this.name = "ConnectRepositoryError";
  }
}

export function outcomeValue<Value>(outcome: ConnectOutcome<Value>, operation: string): Value {
  if (outcome.ok) {
    return outcome.value;
  }
  throw new ConnectRepositoryError(
    operation,
    outcome.problem.code,
    outcome.problem.message,
    outcome.problem,
  );
}

export function queryWithOptions(
  client: ReaderConnectClient,
  input: QueryInput,
  options: ReaderRequestOptions,
): Promise<ConnectOutcome<QueryResult>> {
  return hasRequestOptions(options) ? client.query(input, options) : client.query(input);
}

export function readWithOptions(
  client: ReaderConnectClient,
  input: ReadInput,
  options: ReaderRequestOptions,
): Promise<ConnectOutcome<RecordDocument>> {
  return hasRequestOptions(options) ? client.read(input, options) : client.read(input);
}

export async function mapConcurrent<Input, Output>(
  values: readonly Input[],
  concurrency: number,
  operation: (value: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Concurrent repository work requires at least one worker.");
  }
  const results = new Array<Output>(values.length);
  let nextIndex = 0;
  let stopped = false;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (!stopped && nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          results[index] = await operation(values[index] as Input, index);
        } catch (error) {
          stopped = true;
          throw error;
        }
      }
    }),
  );
  return results;
}

/** Reader records persist their stable ID as a raw field, so resolve paths at the authority. */
export async function recordPathById(
  client: ReaderConnectClient,
  id: string,
  options: ReaderRequestOptions = {},
): Promise<string | null> {
  const input: QueryInput = {
    where: `id == ${JSON.stringify(id)}`,
    frontmatterMode: "effective",
  };
  const metadata = outcomeValue(
    await client.supportsAuthorityFeature("query-metadata-v1", options),
    "discover metadata queries",
  );
  const pages = metadata
    ? client.queryPages(
        { ...input, output: "metadata", includeBody: false, select: ["id"] },
        options,
      )
    : client.queryPages(input, { ...options, firstPageSize: 50, pageSize: 50 });
  for await (const outcome of pages) {
    const page = outcomeValue<QueryPage | QueryMetadataPage>(outcome, "query records");
    let match: string | null = null;
    for (const record of page.results) {
      const candidate =
        "file" in record
          ? (record.effectiveFrontmatter ?? record.frontmatter)?.["id"]
          : record.values["id"];
      match ??= candidate === id ? record.path : null;
    }
    if (match) {
      return match;
    }
  }
  return null;
}

/**
 * Keep Reader's domain repositories independent of SDK types while leaving
 * admission, retry, mutation ordering, and request budgets with the SDK.
 */
export function connectClient(connection: MdbaseConnection): ReaderConnectClient {
  const route = (): string => connection.route;
  function queryPages(
    input: QueryMetadataInput,
    options?: ReaderQueryPagesOptions,
  ): AsyncIterable<ConnectOutcome<QueryMetadataPage>>;
  function queryPages(
    input: QueryInput,
    options?: ReaderQueryPagesOptions,
  ): AsyncIterable<ConnectOutcome<QueryPage>>;
  function queryPages(
    input: QueryInput | QueryMetadataInput,
    options?: ReaderQueryPagesOptions,
  ): AsyncIterable<ConnectOutcome<QueryPage | QueryMetadataPage>> {
    const paging = {
      ...(options?.firstPageSize === undefined ? {} : { firstPageSize: options.firstPageSize }),
      ...(options?.pageSize === undefined ? {} : { pageSize: options.pageSize }),
      ...connectOptions(options),
    };
    return readerDiagnostics.pages<QueryPage | QueryMetadataPage>(
      route,
      input.output === "metadata"
        ? connection.queryPages(input, paging)
        : connection.queryPages(input, paging),
    );
  }
  return {
    supportsAuthorityFeature: (id, options) =>
      connection.supportsAuthorityFeature(id, connectOptions(options)),
    read: (input, options) =>
      readerDiagnostics.measure("read", route, () =>
        connection.read(input, connectOptions(options)),
      ),
    readMany: (paths, options) =>
      readerDiagnostics.measure("read-many", route, () => connection.readMany(paths, options)),
    query: (input, options) =>
      readerDiagnostics.measure("query", route, () =>
        connection.query(input, connectOptions(options)),
      ),
    queryPages,
    create: (input) => readerDiagnostics.measure("create", route, () => connection.create(input)),
    update: (input) => readerDiagnostics.measure("update", route, () => connection.update(input)),
    preflightDelete: (input) =>
      readerDiagnostics.measure("delete-preflight", route, () => connection.preflightDelete(input)),
    deleteWithProgress: (input, options) =>
      readerDiagnostics.measure("delete", route, () =>
        connection.deleteWithProgress(input, options),
      ),
  };
}

export function connectOptions(options: ReaderRequestOptions | undefined): ConnectRequestOptions {
  return {
    ...(options?.signal ? { signal: options.signal } : {}),
    ...(options?.replaceableFamily
      ? {
          coordination: {
            family: options.replaceableFamily,
            latestWins: true,
          },
        }
      : {}),
  };
}

function hasRequestOptions(options: ReaderRequestOptions): boolean {
  return options.signal !== undefined || options.replaceableFamily !== undefined;
}

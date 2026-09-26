import { readerDiagnostics } from "./diagnostics.js";

import type {
  ConnectOutcome,
  ConnectRequestOptions,
  CreateInput,
  DeleteInput,
  DeletePreflightResult,
  DeleteProgressOptions,
  DeleteResult,
  MdbaseConnection,
  QueryInput,
  QueryPage,
  QueryResult,
  ReadInput,
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
  /** Current authority change head; absent/unsupported means no cross-request cache. */
  changeRevision?(options?: ReaderRequestOptions): Promise<number | null>;
  read(input: ReadInput, options?: ReaderRequestOptions): Promise<ConnectOutcome<RecordDocument>>;
  query(input: QueryInput, options?: ReaderRequestOptions): Promise<ConnectOutcome<QueryResult>>;
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
  constructor(operation: string, code: string, detail?: string) {
    super(`mdbase Connect could not ${operation}: ${detail ?? code}`);
    this.name = "ConnectRepositoryError";
  }
}

export function outcomeValue<Value>(outcome: ConnectOutcome<Value>, operation: string): Value {
  if (outcome.ok) {
    return outcome.value;
  }
  throw new ConnectRepositoryError(operation, outcome.problem.code, outcome.problem.message);
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
  for await (const outcome of client.queryPages(
    {
      where: `id == ${JSON.stringify(id)}`,
      frontmatterMode: "effective",
    },
    { ...options, firstPageSize: 50, pageSize: 50 },
  )) {
    const page = outcomeValue(outcome, "query records");
    let match: string | null = null;
    for (const { path, effectiveFrontmatter, frontmatter } of page.results) {
      const candidate = (effectiveFrontmatter ?? frontmatter)?.["id"];
      match ??= candidate === id ? path : null;
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
  return {
    changeRevision: async (options) => {
      // Existing Reader grants include inspect, not necessarily records.watch. Do not
      // broaden authorization merely to enable caching.
      if (!connection.operations.includes("changes")) {
        const description = await readerDiagnostics.measure("describe", route, () =>
          connection.describe(connectOptions(options)),
        );
        if (!description.ok && description.problem.code === "unsupported_operation") {
          return null;
        }
        return outcomeValue(description, "check collection revision").changeCursor;
      }
      const result = await readerDiagnostics.measure("changes", route, () =>
        connection.changes({}, connectOptions(options)),
      );
      if (!result.ok && result.problem.code === "unsupported_operation") {
        return null;
      }
      const page = outcomeValue(result, "check collection revision");
      return !page.reset && !page.hasMore ? page.cursor : null;
    },
    read: (input, options) =>
      readerDiagnostics.measure("read", route, () =>
        connection.read(input, connectOptions(options)),
      ),
    query: (input, options) =>
      readerDiagnostics.measure("query", route, () =>
        connection.query(input, connectOptions(options)),
      ),
    queryPages: (input, options) =>
      readerDiagnostics.pages(
        route,
        connection.queryPages(input, {
          ...(options?.firstPageSize === undefined ? {} : { firstPageSize: options.firstPageSize }),
          ...(options?.pageSize === undefined ? {} : { pageSize: options.pageSize }),
          ...connectOptions(options),
        }),
      ),
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

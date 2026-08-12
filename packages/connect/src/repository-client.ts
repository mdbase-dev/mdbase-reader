import type { annotationContract, sourceContract } from "./contracts.js";
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

export async function recordPathById(
  client: ReaderConnectClient,
  contract: typeof sourceContract | typeof annotationContract,
  id: string,
  options: ReaderRequestOptions = {},
): Promise<string | null> {
  for await (const outcome of client.queryPages(
    { contract, frontmatterMode: "effective" },
    { ...options, firstPageSize: 200, pageSize: 1_000 },
  )) {
    const page = outcomeValue(outcome, "query records");
    const match = page.results.find(
      ({ effectiveFrontmatter, frontmatter }) =>
        (effectiveFrontmatter ?? frontmatter)?.["id"] === id,
    );
    if (match) {
      return match.path;
    }
  }
  return null;
}

/**
 * Keep Reader's domain repositories independent of SDK types while leaving
 * admission, retry, mutation ordering, and request budgets with the SDK.
 */
export function connectClient(connection: MdbaseConnection): ReaderConnectClient {
  return {
    read: (input, options) => connection.read(input, connectOptions(options)),
    query: (input, options) => connection.query(input, connectOptions(options)),
    queryPages: (input, options) =>
      connection.queryPages(input, {
        ...(options?.firstPageSize === undefined ? {} : { firstPageSize: options.firstPageSize }),
        ...(options?.pageSize === undefined ? {} : { pageSize: options.pageSize }),
        ...connectOptions(options),
      }),
    create: (input) => connection.create(input),
    update: (input) => connection.update(input),
    preflightDelete: (input) => connection.preflightDelete(input),
    deleteWithProgress: (input, options) => connection.deleteWithProgress(input, options),
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

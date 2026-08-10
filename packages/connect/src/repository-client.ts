import {
  ConnectOperationScheduler,
  readerConnectGlobalConcurrency,
} from "./operation-scheduler.js";

import type { annotationContract, sourceContract } from "./contracts.js";
import type {
  ConnectOutcome,
  CreateInput,
  DeleteInput,
  DeletePreflightResult,
  DeleteProgressOptions,
  DeleteResult,
  MdbaseConnection,
  QueryInput,
  QueryResult,
  ReadInput,
  RecordDocument,
  UpdateInput,
} from "@mdbase-dev/connect";
import type { ReaderRequestOptions } from "@mdbase-reader/core";

const connectorBusyRetryDelaysMs = [75, 200, 500] as const;
export const readerConnectBulkConcurrency = 4;

export interface ReaderConnectClient {
  read(input: ReadInput, options?: ReaderRequestOptions): Promise<ConnectOutcome<RecordDocument>>;
  query(input: QueryInput, options?: ReaderRequestOptions): Promise<ConnectOutcome<QueryResult>>;
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

export function cursorOffset(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const offset = Number.parseInt(cursor, 10);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
}

export function queryWithOptions(
  client: ReaderConnectClient,
  input: QueryInput,
  options: ReaderRequestOptions,
): Promise<ConnectOutcome<QueryResult>> {
  return options.signal ? client.query(input, options) : client.query(input);
}

export function readWithOptions(
  client: ReaderConnectClient,
  input: ReadInput,
  options: ReaderRequestOptions,
): Promise<ConnectOutcome<RecordDocument>> {
  return options.signal ? client.read(input, options) : client.read(input);
}

export async function retryRejectedConnectorBusy<Value>(
  operation: () => Promise<ConnectOutcome<Value>>,
  options: { readonly signal?: AbortSignal } = {},
): Promise<ConnectOutcome<Value>> {
  let outcome = await operation();
  for (const delayMs of connectorBusyRetryDelaysMs) {
    if (!isRejectedConnectorBusy(outcome)) {
      return outcome;
    }
    await abortableDelay(delayMs, options.signal);
    outcome = await operation();
  }
  return outcome;
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
  const result = outcomeValue(
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

export function connectClient(
  connection: MdbaseConnection,
  scheduler = new ConnectOperationScheduler(readerConnectGlobalConcurrency),
): ReaderConnectClient {
  return {
    read: (input, options) =>
      retryRejectedConnectorBusy(
        () => scheduler.run(() => connection.read(input, options), { signal: options?.signal }),
        options,
      ),
    query: (input, options) =>
      retryRejectedConnectorBusy(
        () => scheduler.run(() => connection.query(input, options), { signal: options?.signal }),
        options,
      ),
    create: (input) =>
      retryRejectedConnectorBusy(() =>
        scheduler.run(() => connection.create(input), { priority: "foreground" }),
      ),
    update: (input) =>
      retryRejectedConnectorBusy(() =>
        scheduler.run(() => connection.update(input), { priority: "foreground" }),
      ),
    preflightDelete: (input) =>
      retryRejectedConnectorBusy(() =>
        scheduler.run(() => connection.preflightDelete(input), { priority: "foreground" }),
      ),
    deleteWithProgress: (input, options) =>
      scheduler.run(() => connection.deleteWithProgress(input, options), {
        priority: "foreground",
        signal: options?.signal,
      }),
  };
}

function isRejectedConnectorBusy(outcome: ConnectOutcome<unknown>): boolean {
  return (
    !outcome.ok &&
    outcome.problem.code === "connector_busy" &&
    (outcome.problem.operation_outcome === "rejected" ||
      outcome.problem.operation_outcome === "not_sent")
  );
}

function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(abortReason(signal));
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    const abort = (): void => {
      clearTimeout(timeout);
      reject(abortReason(signal));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function abortReason(signal: AbortSignal | undefined): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was cancelled.", "AbortError");
}

import { readerDiagnostics } from "./diagnostics.js";
import {
  validationIssueSummary,
  type ConnectValidationIssue,
  type ReaderConnectProblem,
} from "./validation-issues.js";

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

/** How far a create had got when the client returned it. */
export interface ReaderCreateReceipt {
  readonly mutationId: string;
  /**
   * `confirmed`: at a log position. `pending`: kept on this device and not yet confirmed;
   * the log can still refuse it (SDK `client.d.ts` `Write`, `replica-client-api.md` §6).
   */
  readonly state: "confirmed" | "pending";
  /**
   * The replica's ID for the created record: the caller's `replicaId`, or else the
   * receipt's optimistic `records`, which a `pending` receipt may leave out.
   */
  readonly record?: string;
}

export interface ReaderCreateOptions {
  /**
   * A stable name for this one save, such as its client-minted mutation ID. A retry with the
   * same intent lands once natively; the legacy Connect client ignores it.
   */
  readonly intent?: string;
  /**
   * The record ID to create under natively, minted by the caller (SDK `client.d.ts`
   * `CreateInput.id`). Keep it with `intent` and send it again on a retry: it is how the
   * caller knows the record before any receipt names it, since a replica's `pending`
   * receipt need not list the records it touched. The legacy Connect client ignores it.
   */
  readonly replicaId?: string;
  /**
   * Called before a native create resolves. The legacy Connect client never calls it: its
   * creates are decided by the server before they return.
   */
  readonly onReceipt?: (receipt: ReaderCreateReceipt) => void;
}

/**
 * A mutation's receipt (`replica-client-api.md` §6): `pending` until the log decides,
 * then `confirmed` or `rejected` (with the problem), or `unknown` when it was possibly
 * sent before the receipts horizon. `missing` is a receipt the replica no longer has, or
 * never had: it keeps them for at least 24 hours after they leave `pending`.
 */
export type ReaderMutationState =
  | { readonly state: "pending" | "confirmed" | "unknown" | "missing" }
  | { readonly state: "rejected"; readonly problem: ReaderConnectProblem };

/** The record at a path in the local view, as far as a create needs to know. */
export interface ReaderCreatedRecord {
  /** Its Reader `id` field. */
  readonly id: unknown;
  /** True once a log position has changed it, so its create is confirmed. */
  readonly confirmed: boolean;
}

/** A record as this device sees it now, pending writes included. */
export interface ReaderLocalRecord extends ReaderCreatedRecord {
  readonly path: string;
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly body?: string;
}

/** What a client that settles creates later offers to follow them through. Native only. */
export interface ReaderCreateTracking {
  receipt(mutationId: string, options?: ReaderRequestOptions): Promise<ReaderMutationState>;
  recordAt(path: string, options?: ReaderRequestOptions): Promise<ReaderCreatedRecord | null>;
  /** The record with this replica ID in the local view, or null when it is not there. */
  local(replicaId: string, options?: ReaderRequestOptions): Promise<ReaderLocalRecord | null>;
  /**
   * Whether the local view can be trusted to show what the log holds: the ledger has
   * reconciled the writes from before this session (`WriteLedgerSnapshot.restored`), and
   * the replica has caught up with head (`SyncStatus.confirmedThrough >= headKnown`).
   * Until then, a record missing here may simply not have arrived yet.
   */
  caughtUp(): boolean;
  /** Forget a refused write once Reader has dealt with it (SDK `ledger.acknowledge`). */
  acknowledge(mutationId: string): Promise<void>;
}

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
  create(
    input: CreateInput,
    options?: ReaderCreateOptions,
  ): Promise<ConnectOutcome<RecordDocument>>;
  update(input: UpdateInput): Promise<ConnectOutcome<RecordDocument>>;
  preflightDelete(input: DeleteInput): Promise<ConnectOutcome<DeletePreflightResult>>;
  deleteWithProgress(
    input: DeleteInput,
    options?: DeleteProgressOptions,
  ): Promise<ConnectOutcome<DeleteResult>>;
  /** Present when a create can return before the log has decided it. */
  readonly createTracking?: ReaderCreateTracking;
}

export class ConnectRepositoryError extends Error {
  constructor(
    operation: string,
    code: string,
    detail?: string,
    /** The SDK problem, when the failure came from a Connect outcome. */
    readonly problem?: ConnectProblem,
    readonly issues: readonly ConnectValidationIssue[] = [],
  ) {
    const summary = validationIssueSummary(issues);
    super(
      `mdbase Connect could not ${operation}: ${detail ?? code}${summary ? `: ${summary}` : ""}`,
    );
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
    (outcome.problem as ReaderConnectProblem).issues,
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

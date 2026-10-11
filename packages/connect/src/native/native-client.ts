import { connectSuccess } from "@mdbase-dev/connect/advanced";
import { isMdbaseError, MdbaseError, uuidv7 } from "@mdbase-dev/sdk";

import {
  failure,
  fileMetadata,
  metadataRecord,
  nativeQuery,
  outcome,
  OutcomeUnknown,
  plain,
  queryRecord,
  recordDocument,
  resultMeta,
  retired,
  uniquePaths,
  unsupported,
} from "./native-mapping.js";

import type { ReaderConnectClient, ReaderQueryPagesOptions } from "../repository-client.js";
import type {
  ConnectOutcome,
  CreateInput,
  DeleteInput,
  DeletePreflightResult,
  DeleteProgressOptions,
  DeleteResult,
  QueryInput,
  QueryMetadataInput,
  QueryMetadataPage,
  QueryPage,
  QueryRecord,
  QueryResult,
  ReadInput,
  ReadManyOptions,
  ReadManyResult,
  RecordDocument,
  UpdateInput,
} from "@mdbase-dev/connect";
import type {
  ContractQueryRecord,
  Include,
  MdbaseClient,
  PlainValue,
  QueryResult as NativeQueryResult,
  RecordView,
  Write,
} from "@mdbase-dev/sdk";
import type { ReaderRequestOptions } from "@mdbase-reader/core";

/** One native write whose outcome Reader has not yet seen confirmed. */
export interface NativePendingWrite {
  readonly mutationId: string;
  readonly operation: "create" | "update" | "delete";
  readonly recordId: string;
  readonly createdAt: string;
}

/** The recovery handle Reader's body/migration recovery needs, by original request ID. */
export interface NativePendingMutation {
  recover(options?: { readonly signal?: AbortSignal }): Promise<ConnectOutcome<RecordDocument>>;
}

export interface NativeReaderClient extends ReaderConnectClient {
  /** The original native mutation for an `operation_outcome_unknown` request ID. */
  pendingMutation(requestId: string): NativePendingMutation | null;
  pendingWrites(): readonly NativePendingWrite[];
  /** Re-adopt this session's unconfirmed single-record mutations after a reload. */
  restorePending(signal?: AbortSignal): Promise<void>;
  dispose(): void;
}

interface ContractPage {
  readonly rows: QueryRecord[];
  readonly cursor?: string;
  readonly totalCount?: number;
}

type DataContract = NonNullable<QueryInput["contract"]>;
type Submit = (options: { mutationId: string; signal: AbortSignal }) => Promise<Write>;

const MAX_CONTRACT_PAGE = 128;
const DEFAULT_PAGE = 200;
const RECEIPT_WAIT_MS = 30_000;
const REQUEST_BUDGET_MS = 45_000;
const fullInclude: Include = { effective: true, body: true, document: true };
const CONTRACT_REFUSED = [
  "types",
  "where",
  "projections",
  "select",
  "orderBy",
  "groupBy",
  "summaries",
  "snapshot",
] as const;

export function nativeReaderClient(
  client: MdbaseClient,
  isCurrent: () => boolean = () => true,
  options: { readonly receiptWaitMs?: number } = {},
): NativeReaderClient {
  return new NativeRecords(client, isCurrent, options.receiptWaitMs ?? RECEIPT_WAIT_MS);
}

/**
 * Reader's record seam over one borrowed public SDK client. The SDK owns sign-in,
 * selection and the client's lifetime; this adapter never closes it, never resubmits
 * a write under a new identity, and stops at every await once `isCurrent` is false.
 * A write is reported saved only after its exact receipt confirms and a confirmed
 * readback exists; otherwise the original mutation ID is kept for recovery.
 */
class NativeRecords implements NativeReaderClient {
  readonly #lifetime = new AbortController();
  readonly #pending = new Map<string, NativePendingWrite>();

  constructor(
    private readonly client: MdbaseClient,
    private readonly isCurrent: () => boolean,
    private readonly receiptWaitMs: number,
  ) {}

  supportsAuthorityFeature(id: string): Promise<ConnectOutcome<boolean>> {
    return Promise.resolve(
      connectSuccess(id === "query-metadata-v1" || id === "read-many-documents-v1"),
    );
  }

  read(
    input: ReadInput,
    options: ReaderRequestOptions = {},
  ): Promise<ConnectOutcome<RecordDocument>> {
    return outcome(async () => {
      if (input.contract) {
        throw unsupported("Reading one record through a contract view is not available natively.");
      }
      const signal = this.#scope(options.signal);
      const record = await this.client.get({ path: input.path }, fullInclude, signal);
      this.#check(signal);
      return recordDocument(record);
    });
  }

  readMany(
    paths: readonly string[],
    options: ReadManyOptions = {},
  ): Promise<ConnectOutcome<ReadManyResult>> {
    return outcome(async () => {
      const signal = this.#scope(options.signal);
      const types = options.types ? new Set(options.types) : null;
      const include: Include = { effective: true, body: options.includeBody === true };
      const unique = [...new Set(paths)];
      const found = new Map<string, RecordView>();
      let next = 0;
      const worker = async (): Promise<void> => {
        for (let path = unique[next++]; path !== undefined; path = unique[next++]) {
          const record = await this.client.find({ path }, include, signal);
          this.#check(signal);
          if (record && (!types || record.types.some((type) => types.has(type)))) {
            found.set(path, record);
          }
        }
      };
      const width = Math.max(1, Math.min(options.concurrency ?? 4, 4, unique.length));
      await Promise.all(Array.from({ length: width }, worker));
      return {
        results: paths.map((path) => {
          const record = found.get(path);
          return record
            ? { status: "found" as const, path, record: queryRecord(record) }
            : { status: "missing" as const, path };
        }),
        errors: [],
      };
    });
  }

  query(
    input: QueryInput,
    options: ReaderRequestOptions = {},
  ): Promise<ConnectOutcome<QueryResult>> {
    return outcome(async () => {
      const signal = this.#scope(options.signal);
      if (input.contract) {
        const rows: QueryRecord[] = [];
        let last: ContractPage | undefined;
        const limit = input.limit ?? DEFAULT_PAGE;
        for await (const page of this.#contractPages(input, input.contract, limit, signal)) {
          rows.push(...page.rows);
          last = page;
          if (input.limit === undefined) {
            break;
          }
        }
        return { results: rows, meta: last ? resultMeta(last) : { hasMore: false } };
      }
      const { query, include } = nativeQuery(input);
      const result = await this.client.query(query, include, signal);
      this.#check(signal);
      return { results: result.records.map(queryRecord), meta: resultMeta(result) };
    });
  }

  queryPages(
    input: QueryMetadataInput,
    options?: ReaderQueryPagesOptions,
  ): AsyncIterable<ConnectOutcome<QueryMetadataPage>>;
  queryPages(
    input: QueryInput,
    options?: ReaderQueryPagesOptions,
  ): AsyncIterable<ConnectOutcome<QueryPage>>;
  async *queryPages(
    input: QueryInput | QueryMetadataInput,
    options: ReaderQueryPagesOptions = {},
  ): AsyncIterable<ConnectOutcome<QueryPage | QueryMetadataPage>> {
    const metadata = input.output === "metadata";
    const pageSize = options.firstPageSize ?? options.pageSize ?? DEFAULT_PAGE;
    let page = 0;
    let loaded = 0;
    try {
      const signal = this.#scope(options.signal);
      const pages =
        !metadata && input.contract
          ? this.#contractPages(input, input.contract, pageSize, signal)
          : this.#ordinaryPages(input, pageSize, signal);
      for await (const result of pages) {
        const results =
          "rows" in result
            ? result.rows
            : result.records.map((record) =>
                metadata ? metadataRecord(record) : queryRecord(record),
              );
        const offset = loaded;
        loaded += results.length;
        page += 1;
        yield connectSuccess({
          results,
          meta: resultMeta(result),
          page,
          offset,
          loaded,
          complete: !result.cursor,
          ...(result.cursor ? { cursor: result.cursor } : {}),
          ...(metadata ? { output: "metadata" as const } : {}),
        } as QueryPage | QueryMetadataPage);
      }
    } catch (error) {
      yield failure(error);
    }
  }

  create(input: CreateInput): Promise<ConnectOutcome<RecordDocument>> {
    return outcome(async () => {
      if (input.contract || input.ifRevision !== undefined) {
        throw unsupported("Contract-targeted creates are not available natively.");
      }
      const signal = this.#scope();
      const id = uuidv7();
      const fields = {
        id,
        ...(input.type ? { type: input.type } : {}),
        ...(input.path ? { path: input.path } : {}),
        ...(input.frontmatter
          ? { frontmatter: input.frontmatter as Record<string, PlainValue> }
          : {}),
        ...(input.body === undefined ? {} : { body: input.body }),
      };
      return saved(
        await this.#write("create", id, (write) => this.client.create(fields, write), signal),
      );
    });
  }

  update(input: UpdateInput): Promise<ConnectOutcome<RecordDocument>> {
    return outcome(async () => {
      if (input.contract) {
        throw unsupported("Contract-targeted updates are not available natively.");
      }
      const signal = this.#scope();
      const base = await this.#current(input.path, input.ifRevision, signal);
      if (input.document !== undefined) {
        const document = input.document;
        const ifRevision = input.ifRevision ?? base.revision;
        const submit: Submit = (write) =>
          this.client.replaceDocument(base, document, { ...write, ifRevision });
        return saved(await this.#write("update", base.id, submit, signal));
      }
      // Connect patches remove a top-level field given null (mdbase §12.3).
      const entries = Object.entries(input.patch).filter(([, value]) => value !== undefined);
      const patch = Object.fromEntries(entries.filter(([, value]) => value !== null)) as Record<
        string,
        PlainValue
      >;
      const unset = entries.filter(([, value]) => value === null).map(([key]) => key);
      const changes = {
        patch,
        ...(unset.length > 0 ? { unset } : {}),
        ...(input.body === undefined ? {} : { body: input.body }),
        ...(input.ifRevision === undefined ? {} : { ifRevision: input.ifRevision }),
      };
      const submit: Submit = (write) => this.client.update(base, changes, write);
      return saved(await this.#write("update", base.id, submit, signal));
    });
  }

  preflightDelete(input: DeleteInput): Promise<ConnectOutcome<DeletePreflightResult>> {
    return outcome(async () => {
      if (input.contract) {
        throw unsupported("Contract-targeted deletes are not available natively.");
      }
      const signal = this.#scope();
      const base = await this.#current(input.path, input.ifRevision, signal);
      const preflight = await this.client.preflightDelete(base);
      this.#check(signal);
      const brokenLinks = uniquePaths(preflight.broken);
      return {
        path: base.path,
        deleted: false,
        dryRun: true,
        wouldDelete: true,
        ...(brokenLinks.length > 0 ? { brokenLinks } : {}),
      };
    });
  }

  deleteWithProgress(
    input: DeleteInput,
    options: DeleteProgressOptions = {},
  ): Promise<ConnectOutcome<DeleteResult>> {
    return outcome(async () => {
      if (input.contract) {
        throw unsupported("Contract-targeted deletes are not available natively.");
      }
      const started = Date.now();
      const progress = (state: "preflighting" | "applying" | "completed"): void =>
        options.onProgress?.({
          operation: "delete",
          state,
          elapsedMs: Date.now() - started,
          cancellable: state !== "completed",
          resumed: false,
          completedUnits: state === "completed" ? 1 : 0,
        });
      const signal = this.#scope(options.signal);
      progress("preflighting");
      const base = await this.#current(input.path, input.ifRevision, signal);
      const brokenLinks = input.checkBacklinks
        ? await this.#confirmedBreaks(base, options, signal)
        : [];
      progress("applying");
      const ifRevision = input.ifRevision ?? base.revision;
      const submit: Submit = (write) => this.client.delete(base, { ...write, ifRevision });
      await this.#write("delete", base.id, submit, signal);
      progress("completed");
      return {
        path: base.path,
        deleted: true,
        ...(brokenLinks.length > 0 ? { brokenLinks } : {}),
      };
    });
  }

  pendingMutation(requestId: string): NativePendingMutation | null {
    const mutation = this.#pending.get(requestId);
    if (!mutation) {
      return null;
    }
    return {
      recover: (options = {}) =>
        outcome(async () => {
          const document = await this.#confirm(mutation, this.#scope(options.signal));
          if (!document) {
            throw unsupported("The recovered operation deleted its record.");
          }
          return document;
        }),
    };
  }

  pendingWrites(): readonly NativePendingWrite[] {
    return [...this.#pending.values()];
  }

  async restorePending(signal?: AbortSignal): Promise<void> {
    const current = this.#scope(signal);
    const writes = await this.client.pendingWrites(current);
    this.#check(current);
    for (const mutation of writes) {
      const op = mutation.ops.length === 1 ? mutation.ops[0] : undefined;
      if (!op || !("id" in op)) {
        continue;
      }
      const operation = op.kind === "document" ? "update" : op.kind;
      if (operation !== "create" && operation !== "update" && operation !== "delete") {
        continue;
      }
      this.#pending.set(mutation.receipt.mutation, {
        mutationId: mutation.receipt.mutation,
        operation,
        recordId: op.id,
        createdAt: new Date(mutation.captured).toISOString(),
      });
    }
  }

  dispose(): void {
    this.#lifetime.abort();
  }

  #check(signal: AbortSignal): void {
    if (!this.isCurrent()) {
      throw retired();
    }
    signal.throwIfAborted();
  }

  #scope(extra?: AbortSignal): AbortSignal {
    this.#check(this.#lifetime.signal);
    extra?.throwIfAborted();
    return AbortSignal.any([
      this.#lifetime.signal,
      ...(extra ? [extra] : []),
      AbortSignal.timeout(REQUEST_BUDGET_MS),
    ]);
  }

  async #current(
    path: string,
    ifRevision: string | undefined,
    signal: AbortSignal,
  ): Promise<RecordView> {
    const record = await this.client.get({ path }, fullInclude, signal);
    this.#check(signal);
    if (ifRevision !== undefined && record.revision !== ifRevision) {
      throw new MdbaseError({
        code: "conflict",
        reason: "revision_mismatch",
        recovery: "refresh",
        message: "This record changed after it was read.",
      });
    }
    return record;
  }

  /** Links the delete would break, refused when more than the user confirmed. */
  async #confirmedBreaks(
    base: RecordView,
    options: DeleteProgressOptions,
    signal: AbortSignal,
  ): Promise<{ path: string }[]> {
    const brokenLinks = uniquePaths((await this.client.preflightDelete(base)).broken);
    this.#check(signal);
    const shown = new Set(options.preflight?.brokenLinks?.map(({ path }) => path) ?? []);
    if (options.preflight && brokenLinks.some(({ path }) => !shown.has(path))) {
      throw new MdbaseError({
        code: "conflict",
        reason: "preflight_changed",
        recovery: "refresh",
        message: "More links would break than were confirmed. Review the deletion again.",
      });
    }
    return brokenLinks;
  }

  async #write(
    operation: NativePendingWrite["operation"],
    recordId: string,
    submit: Submit,
    signal: AbortSignal,
  ): Promise<RecordDocument | null> {
    this.#check(signal);
    const mutationId = uuidv7();
    const mutation = { mutationId, operation, recordId, createdAt: new Date().toISOString() };
    this.#pending.set(mutationId, mutation);
    try {
      const submitted = await submit({ mutationId, signal });
      if (submitted.mutationId !== mutationId) {
        throw new Error("The native write changed its mutation identity.");
      }
    } catch (error) {
      // An error code alone does not prove the write was not captured. Only the
      // exact receipt settles it: no receipt for this ID means nothing was written.
      if (await this.#captured(mutationId)) {
        throw new OutcomeUnknown(mutationId);
      }
      this.#pending.delete(mutationId);
      throw error;
    }
    try {
      this.#check(signal);
      return await this.#confirm(mutation, signal);
    } catch (error) {
      // Still unsettled (a dropped link, a timeout, a retired scope): keep the
      // original identity and report it for recovery, never as a plain failure.
      if (this.#pending.has(mutationId) && !(error instanceof OutcomeUnknown)) {
        throw new OutcomeUnknown(mutationId);
      }
      throw error;
    }
  }

  async #captured(mutationId: string): Promise<boolean> {
    try {
      await this.client.receipt(mutationId, AbortSignal.timeout(10_000));
      return true;
    } catch (error) {
      return !isMdbaseError(error, "not_found");
    }
  }

  async #confirm(
    mutation: NativePendingWrite,
    signal: AbortSignal,
  ): Promise<RecordDocument | null> {
    const receipt = await this.client.awaitReceipt(mutation.mutationId, this.receiptWaitMs, signal);
    this.#check(signal);
    if (receipt.mutation !== mutation.mutationId) {
      throw new Error("The native receipt changed its mutation identity.");
    }
    if (receipt.state === "pending" || receipt.state === "unknown") {
      throw new OutcomeUnknown(mutation.mutationId);
    }
    if (receipt.state === "rejected" || receipt.status === "conflicted") {
      this.#pending.delete(mutation.mutationId);
      throw new MdbaseError(
        receipt.problem ?? {
          code: "conflict",
          recovery: "resolve_conflict",
          message: "This change conflicts with another edit. Resolve it before continuing.",
        },
      );
    }
    if (mutation.operation === "delete") {
      this.#pending.delete(mutation.mutationId);
      return null;
    }
    const record = await this.client.get(mutation.recordId, fullInclude, signal);
    this.#check(signal);
    if (record.id !== mutation.recordId) {
      throw new Error("The saved record changed its identity.");
    }
    if (record.state.state !== "confirmed" || record.state.hold || record.state.unresolved) {
      throw new OutcomeUnknown(mutation.mutationId);
    }
    this.#pending.delete(mutation.mutationId);
    return recordDocument(record);
  }

  async *#ordinaryPages(
    input: QueryInput | QueryMetadataInput,
    pageSize: number,
    signal: AbortSignal,
  ): AsyncGenerator<NativeQueryResult> {
    const { query, include } = nativeQuery({ ...input, limit: pageSize });
    for await (const page of this.client.pages(query, include, signal)) {
      this.#check(signal);
      yield page;
    }
  }

  async *#contractPages(
    input: QueryInput,
    contract: DataContract,
    pageSize: number,
    signal: AbortSignal,
  ): AsyncGenerator<ContractPage> {
    if (CONTRACT_REFUSED.some((key) => input[key] !== undefined) || (input.offset ?? 0) > 0) {
      throw unsupported(
        "Semantic contract queries accept only pagination and frontmatter mode here.",
      );
    }
    const size = Math.max(1, Math.min(pageSize, MAX_CONTRACT_PAGE));
    const seen = new Set<string>();
    let cursor = input.cursor;
    let remaining = input.limit ?? Number.POSITIVE_INFINITY;
    do {
      const result = await this.client.queryContract(
        { id: contract.id, version: contract.version },
        { pageSize: Math.min(size, remaining), signal, ...(cursor ? { cursor } : {}) },
      );
      this.#check(signal);
      const views = new Map(result.page.records.map((view) => [view.id, view]));
      const rows = result.records.map((record) => contractRow(record, views, contract));
      remaining -= rows.length;
      cursor = remaining > 0 ? result.page.cursor : undefined;
      if (cursor && seen.has(cursor)) {
        throw new Error("The collection repeated a query page.");
      }
      if (cursor) {
        seen.add(cursor);
      }
      yield {
        rows,
        ...(cursor ? { cursor } : {}),
        ...(result.page.totalCount === undefined ? {} : { totalCount: result.page.totalCount }),
      };
    } while (cursor);
  }
}

function contractRow(
  record: ContractQueryRecord,
  views: ReadonlyMap<string, RecordView>,
  contract: DataContract,
): QueryRecord {
  const view = views.get(record.id);
  const projection = contract.type
    ? record.implementations.find((item) => item.typeName === contract.type)
    : record.implementations.length === 1
      ? record.implementations[0]
      : undefined;
  if (!view || !projection) {
    throw unsupported(
      "A record implements this contract more than once; choose its type explicitly.",
    );
  }
  const fields = plain(projection.fields);
  return {
    path: view.path,
    revision: view.revision,
    types: [...view.types],
    frontmatter: fields,
    effectiveFrontmatter: fields,
    file: fileMetadata(view),
  };
}

function saved(document: RecordDocument | null): RecordDocument {
  if (!document) {
    throw new Error("The collection did not return the saved record.");
  }
  return document;
}

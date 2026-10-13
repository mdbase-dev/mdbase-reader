import { connectSuccess } from "@mdbase-dev/connect/advanced";
import { isMdbaseError, MdbaseError, uuidv7 } from "@mdbase-dev/sdk";

import {
  contractDocument,
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

import type {
  ReaderConnectClient,
  ReaderCreateOptions,
  ReaderQueryPagesOptions,
} from "../repository-client.js";
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
  ContractSelector,
  Include,
  MdbaseClient,
  PlainValue,
  QueryResult as NativeQueryResult,
  RecordView,
  Write,
} from "@mdbase-dev/sdk";
import type { ReaderRequestOptions } from "@mdbase-reader/core";

/** The log refused the write: a plain failure, nothing to recover. */
class Refused extends MdbaseError {}

/** One native write, kept by ID while its outcome is unknown. */
interface NativeMutation {
  readonly mutationId: string;
  readonly operation: "create" | "update" | "delete";
  /** The record's ID, or the path of a create whose ID the SDK derived from its intent. */
  readonly record: string | { readonly path: string };
  /** Contract writes are read back through the same contract view. */
  readonly contract?: ContractSelector;
}

/** The recovery handle Reader's body/migration recovery needs, by original request ID. */
export interface NativePendingMutation {
  recover(options?: { readonly signal?: AbortSignal }): Promise<ConnectOutcome<RecordDocument>>;
}

export interface NativeReaderClient extends ReaderConnectClient {
  /** The original native mutation for an `operation_outcome_unknown` request ID. */
  pendingMutation(requestId: string): NativePendingMutation | null;
  dispose(): void;
}

interface ContractPage {
  readonly rows: QueryRecord[];
  readonly cursor?: string;
  readonly totalCount?: number;
}

type DataContract = NonNullable<QueryInput["contract"]>;
/** A write either takes a minted mutation ID or names its intent; the SDK derives the rest. */
type Submit = (
  options: ({ mutationId: string } | { intent: string }) & { signal: AbortSignal },
) => Promise<Write>;
type WriteTarget = Omit<NativeMutation, "mutationId"> & { readonly intent?: string };

const MAX_CONTRACT_PAGE = 128;
const DEFAULT_PAGE = 200;
/** How long a save waits for the log before it counts as saved on this device (as `client.save()`). */
const RECEIPT_WAIT_MS = 3_000;
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
 * A write the replica captured is saved: confirmed, or saved on this device when
 * the log has not confirmed it within the wait. The SDK's write ledger keeps and
 * settles those. Only a refused write fails, and only an unknown outcome keeps its
 * original mutation ID for recovery.
 */
class NativeRecords implements NativeReaderClient {
  readonly #lifetime = new AbortController();
  readonly #unknown = new Map<string, NativeMutation>();

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
      const signal = this.#scope(options.signal);
      if (input.contract) {
        // Contract views carry contract fields only; the body is never part of them.
        const view = await this.client.getContract({ path: input.path }, input.contract, signal);
        this.#check(signal);
        return contractDocument(view);
      }
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

  create(
    input: CreateInput,
    options: ReaderCreateOptions = {},
  ): Promise<ConnectOutcome<RecordDocument>> {
    return outcome(async () => {
      if (input.ifRevision !== undefined) {
        throw unsupported("Conditional creates are not available natively.");
      }
      const { intent } = options;
      // With an intent the SDK derives the record ID, so a retry creates the same record;
      // it is read back by its path.
      const record: NativeMutation["record"] | undefined =
        intent === undefined
          ? uuidv7()
          : input.path === undefined
            ? undefined
            : { path: input.path };
      if (record === undefined) {
        throw unsupported("A retryable create needs a path.");
      }
      const signal = this.#scope();
      const fields = {
        ...(typeof record === "string" ? { id: record } : {}),
        ...(input.contract ? { contract: input.contract } : {}),
        ...(input.type ? { type: input.type } : {}),
        ...(input.path ? { path: input.path } : {}),
        ...(input.frontmatter
          ? { frontmatter: input.frontmatter as Record<string, PlainValue> }
          : {}),
        ...(input.body === undefined ? {} : { body: input.body }),
      };
      return saved(
        await this.#write(
          {
            operation: "create",
            record,
            ...(intent === undefined ? {} : { intent }),
            ...(input.contract ? { contract: input.contract } : {}),
          },
          (write) => this.client.create(fields, write),
          signal,
        ),
      );
    });
  }

  update(input: UpdateInput): Promise<ConnectOutcome<RecordDocument>> {
    return outcome(async () => {
      const signal = this.#scope();
      if (input.contract) {
        return saved(await this.#contractUpdate(input, input.contract, signal));
      }
      const base = await this.#current(input.path, input.ifRevision, signal);
      if (input.document !== undefined) {
        const document = input.document;
        const ifRevision = input.ifRevision ?? base.revision;
        const submit: Submit = (write) =>
          this.client.replaceDocument(base, document, { ...write, ifRevision });
        return saved(await this.#write({ operation: "update", record: base.id }, submit, signal));
      }
      const changes = {
        ...patchChanges(input.patch),
        ...(input.body === undefined ? {} : { body: input.body }),
        ...(input.ifRevision === undefined ? {} : { ifRevision: input.ifRevision }),
      };
      const submit: Submit = (write) => this.client.update(base, changes, write);
      return saved(await this.#write({ operation: "update", record: base.id }, submit, signal));
    });
  }

  preflightDelete(input: DeleteInput): Promise<ConnectOutcome<DeletePreflightResult>> {
    return outcome(async () => {
      const signal = this.#scope();
      const base = await this.#current(input.path, input.ifRevision, signal, input.contract);
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
      const base = await this.#current(input.path, input.ifRevision, signal, input.contract);
      const brokenLinks = input.checkBacklinks
        ? await this.#confirmedBreaks(base, options, signal)
        : [];
      progress("applying");
      const ifRevision = input.ifRevision ?? base.revision;
      const contract = input.contract ? { contract: input.contract } : {};
      const submit: Submit = (write) =>
        this.client.delete(base, { ...write, ifRevision, ...contract });
      await this.#write({ operation: "delete", record: base.id }, submit, signal);
      progress("completed");
      return {
        path: base.path,
        deleted: true,
        ...(brokenLinks.length > 0 ? { brokenLinks } : {}),
      };
    });
  }

  pendingMutation(requestId: string): NativePendingMutation | null {
    const mutation = this.#unknown.get(requestId);
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

  /** The record at `path`; with a contract, it must also implement that contract. */
  async #current(
    path: string,
    ifRevision: string | undefined,
    signal: AbortSignal,
    contract?: ContractSelector,
  ): Promise<RecordView> {
    if (contract) {
      await this.client.getContract({ path }, contract, signal);
      this.#check(signal);
    }
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
    { intent, ...target }: WriteTarget,
    submit: Submit,
    signal: AbortSignal,
  ): Promise<RecordDocument | null> {
    this.#check(signal);
    const identity = intent === undefined ? { mutationId: uuidv7() } : { intent };
    const minted = "mutationId" in identity ? identity.mutationId : undefined;
    let mutationId = minted;
    try {
      const submitted = await submit({ ...identity, signal });
      if (minted !== undefined && submitted.mutationId !== minted) {
        throw new Error("The native write changed its mutation identity.");
      }
      mutationId = submitted.mutationId;
    } catch (error) {
      // The SDK names the mutation an intent stood for on the error it reports.
      mutationId ??= isMdbaseError(error) ? error.mutationId : undefined;
      // An error code alone does not prove the write was not captured. Only the
      // exact receipt settles it: no receipt for this ID means nothing was written.
      if (mutationId === undefined || !(await this.#captured(mutationId))) {
        throw error;
      }
    }
    const mutation: NativeMutation = { mutationId, ...target };
    try {
      return await this.#confirm(mutation, signal);
    } catch (error) {
      if (error instanceof Refused) {
        throw error;
      }
      // Captured but not settled here (unknown, a dropped link, a retired scope):
      // keep the original identity for recovery, never report a plain failure.
      this.#unknown.set(mutation.mutationId, mutation);
      throw error instanceof OutcomeUnknown ? error : new OutcomeUnknown(mutation.mutationId);
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

  /** Settle a captured write: confirmed or saved on this device reads back; refused fails. */
  async #confirm(mutation: NativeMutation, signal: AbortSignal): Promise<RecordDocument | null> {
    this.#check(signal);
    // Still pending after the wait is saved on this device, not a failure.
    const receipt = await this.client
      .awaitReceipt(mutation.mutationId, this.receiptWaitMs, signal)
      .catch((error: unknown) => {
        if (isMdbaseError(error, "cancelled")) {
          throw error;
        }
        this.#check(signal);
        return this.client.receipt(mutation.mutationId, signal);
      });
    this.#check(signal);
    if (receipt.mutation !== mutation.mutationId) {
      throw new Error("The native receipt changed its mutation identity.");
    }
    if (receipt.state === "unknown") {
      throw new OutcomeUnknown(mutation.mutationId);
    }
    this.#unknown.delete(mutation.mutationId);
    if (receipt.state === "rejected" || receipt.status === "conflicted") {
      throw new Refused(
        receipt.problem ?? {
          code: "conflict",
          recovery: "resolve_conflict",
          message: "This change conflicts with another edit. Resolve it before continuing.",
        },
      );
    }
    if (mutation.operation === "delete") {
      return null;
    }
    const record = await this.client.get(mutation.record, fullInclude, signal);
    this.#check(signal);
    if (
      typeof mutation.record === "string"
        ? record.id !== mutation.record
        : record.path !== mutation.record.path
    ) {
      throw new Error("The saved record changed its identity.");
    }
    if (record.state.hold || record.state.unresolved) {
      throw new OutcomeUnknown(mutation.mutationId);
    }
    if (mutation.contract) {
      const view = await this.client.getContract(record, mutation.contract, signal);
      this.#check(signal);
      return contractDocument(view);
    }
    return recordDocument(record);
  }

  /** Contract fields only: the replica maps them to the implementing type's fields. */
  async #contractUpdate(
    input: UpdateInput,
    contract: ContractSelector,
    signal: AbortSignal,
  ): Promise<RecordDocument | null> {
    if (input.document !== undefined || input.body !== undefined) {
      throw unsupported("Contract updates change contract fields only, not the body.");
    }
    const view = await this.client.getContract({ path: input.path }, contract, signal);
    this.#check(signal);
    const changes = {
      contract,
      ...patchChanges(input.patch),
      ifRevision: input.ifRevision ?? view.revision,
    };
    const submit: Submit = (write) => this.client.update(view, changes, write);
    return this.#write({ operation: "update", record: view.id, contract }, submit, signal);
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

/** Connect patches remove a top-level field given null (mdbase §12.3). */
function patchChanges(input: Readonly<Record<string, unknown>>): {
  patch: Record<string, PlainValue>;
  unset?: string[];
} {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  const patch = Object.fromEntries(entries.filter(([, value]) => value !== null)) as Record<
    string,
    PlainValue
  >;
  const unset = entries.filter(([, value]) => value === null).map(([key]) => key);
  return { patch, ...(unset.length > 0 ? { unset } : {}) };
}

function saved(document: RecordDocument | null): RecordDocument {
  if (!document) {
    throw new Error("The collection did not return the saved record.");
  }
  return document;
}

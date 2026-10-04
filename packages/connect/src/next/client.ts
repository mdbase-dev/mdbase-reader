// mdbase-next backend: ReaderConnectClient over the new SDK's MdbaseClient.
import { connectFailure, connectSuccess } from "@mdbase-dev/connect/advanced";
import {
  isMdbaseError,
  mdbaseError,
  type MdbaseClient,
  type Include,
  type MdbaseError,
  type PlainValue,
  type Query,
  type RecordView,
  type Write,
} from "@mdbase-dev/sdk";

import { readerDiagnostics } from "../diagnostics.js";
import { mapConcurrent } from "../repository-client.js";

import { asMdbaseError, nextOutcome, nextProblem } from "./errors.js";
import { nextQuery, queryRecord, readInclude, recordDocument, typeForContract } from "./records.js";

import type { ReaderConnectClient, ReaderQueryPagesOptions } from "../repository-client.js";
import type {
  ConnectOutcome,
  CreateInput,
  DeleteInput,
  DeletePreflightResult,
  DeleteProgressOptions,
  DeleteResult,
  JsonObject,
  QueryInput,
  QueryMetadataInput,
  QueryMetadataPage,
  QueryMetadataRecord,
  QueryPage,
  QueryRecord,
  QueryResult,
  ReadManyEntry,
  ReadManyOptions,
  ReadManyResult,
  RecordDocument,
  UpdateInput,
} from "@mdbase-dev/connect";
import type { ReaderRequestOptions } from "@mdbase-reader/core";

export interface NextReaderClientOptions {
  /**
   * Writes that carry `ifRevision` wait for confirmation (default), so a CAS refusal
   * at head still reaches Reader as a `conflict`. Other writes return optimistically.
   */
  readonly confirmCasWrites?: boolean;
  /** An optimistic write was rejected after it returned. */
  readonly onRejected?: (error: MdbaseError, path: string) => void;
}

/** Reader features this backend answers; read-many returns revision-qualified records. */
const supportedFeatures = new Set(["read-many-documents-v1"]);

const route = (): string => "relay";

function signalOf(options?: ReaderRequestOptions): AbortSignal | undefined {
  return options?.signal;
}

/**
 * Keeps Reader's repositories independent of SDK types. Reads map to `get`/`query`,
 * writes to field-level `create`/`update`/`delete` with opt-in CAS.
 */
export function nextReaderClient(
  db: MdbaseClient,
  options: NextReaderClientOptions = {},
): ReaderConnectClient {
  const writes = new NextWrites(db, options);
  function queryPages(
    input: QueryMetadataInput,
    paging?: ReaderQueryPagesOptions,
  ): AsyncIterable<ConnectOutcome<QueryMetadataPage>>;
  function queryPages(
    input: QueryInput,
    paging?: ReaderQueryPagesOptions,
  ): AsyncIterable<ConnectOutcome<QueryPage>>;
  function queryPages(
    input: QueryInput | QueryMetadataInput,
    paging?: ReaderQueryPagesOptions,
  ): AsyncIterable<ConnectOutcome<QueryPage | QueryMetadataPage>> {
    return readerDiagnostics.pages(route, nextPages(db, input, paging));
  }
  return {
    supportsAuthorityFeature: (id) => Promise.resolve(connectSuccess(supportedFeatures.has(id))),
    read: (input, request) =>
      readerDiagnostics.measure("read", route, () =>
        nextOutcome(async () =>
          recordDocument(
            await db.get(
              { path: input.path },
              readInclude({ includeBody: true, includeDocument: input.includeDocument ?? false }),
              signalOf(request),
            ),
          ),
        ),
      ),
    readMany: (paths, request) =>
      readerDiagnostics.measure("read-many", route, () => readMany(db, paths, request)),
    query: (input, request) =>
      readerDiagnostics.measure("query", route, () =>
        nextOutcome(() => queryOnce(db, input, signalOf(request))),
      ),
    queryPages,
    create: (input) =>
      readerDiagnostics.measure("create", route, () => nextOutcome(() => writes.create(input))),
    update: (input) =>
      readerDiagnostics.measure("update", route, () => nextOutcome(() => writes.update(input))),
    preflightDelete: (input) =>
      readerDiagnostics.measure("delete-preflight", route, () =>
        nextOutcome(() => writes.preflightDelete(input)),
      ),
    deleteWithProgress: (input, progress) =>
      readerDiagnostics.measure("delete", route, () =>
        nextOutcome(() => writes.delete(input, progress)),
      ),
  };
}

type BatchFailure = ReadManyResult["errors"][number]["failure"];

async function readMany(
  db: MdbaseClient,
  paths: readonly string[],
  options: ReadManyOptions = {},
): Promise<ConnectOutcome<ReadManyResult>> {
  const include = readInclude(options);
  const errors: ReadManyResult["errors"] = [];
  const results = await mapConcurrent(
    paths,
    Math.min(Math.max(options.concurrency ?? 4, 1), 4),
    async (path, batch): Promise<ReadManyEntry> => {
      try {
        const view = await db.find({ path }, include, options.signal);
        const wanted = !options.types || view?.types.some((type) => options.types?.includes(type));
        return view && wanted
          ? { status: "found", path, record: queryRecord(view) }
          : { status: "missing", path };
      } catch (error) {
        const problem = nextProblem(asMdbaseError(error));
        if (problem.code === "operation_cancelled") {
          throw error;
        }
        errors.push({
          batch,
          paths: [path],
          failure: connectFailure(problem as BatchFailure["problem"]),
        });
        return { status: "error", path, batch };
      }
    },
  );
  return connectSuccess({ results, errors });
}

/** One query page. Offsets are emulated by reading past them: the replica pages by cursor. */
async function queryOnce(
  db: MdbaseClient,
  input: QueryInput,
  signal?: AbortSignal,
): Promise<QueryResult> {
  const offset = input.offset ?? 0;
  const query: Query = {
    ...nextQuery(input),
    ...(input.limit === undefined ? {} : { limit: offset + input.limit }),
    ...(input.cursor ? { cursor: input.cursor } : {}),
  };
  const page = await db.query(query, readInclude(input), signal);
  const results = page.records.slice(offset).map(queryRecord);
  const hasMore = page.cursor !== undefined;
  return {
    results,
    meta: {
      hasMore,
      ...(page.cursor ? { cursor: page.cursor } : {}),
      ...(hasMore ? {} : { totalCount: offset + results.length }),
    },
  };
}

function metadataRecord(row: QueryRecord, select: QueryInput["select"]): QueryMetadataRecord {
  const fields = row.effectiveFrontmatter ?? row.frontmatter ?? {};
  const values: JsonObject = {};
  for (const entry of select ?? []) {
    const name = typeof entry === "string" ? entry : entry.name;
    const value = fields[name];
    if (!name.startsWith("projection.") && value !== undefined) {
      values[name] = value;
    }
  }
  return { path: row.path, types: row.types, revision: row.revision ?? "", values };
}

async function* nextPages(
  db: MdbaseClient,
  input: QueryInput | QueryMetadataInput,
  options: ReaderQueryPagesOptions = {},
): AsyncGenerator<ConnectOutcome<QueryPage | QueryMetadataPage>> {
  const query = nextQuery(input);
  const include = input.output === "metadata" ? {} : readInclude(input);
  const firstSize = options.firstPageSize ?? options.pageSize ?? 200;
  let cursor: string | undefined;
  let loaded = 0;
  for (let page = 0; ; page += 1) {
    let result;
    try {
      result = await db.query(
        {
          ...query,
          limit: page === 0 ? firstSize : (options.pageSize ?? firstSize),
          ...(cursor ? { cursor } : {}),
        },
        include,
        options.signal,
      );
    } catch (error) {
      yield connectFailure(nextProblem(asMdbaseError(error)));
      return;
    }
    const rows = result.records.map(queryRecord);
    const offset = loaded;
    loaded += rows.length;
    cursor = result.cursor;
    const common = {
      page,
      offset,
      loaded,
      complete: cursor === undefined,
      meta: { hasMore: cursor !== undefined, ...(cursor ? { cursor } : {}) },
      ...(cursor ? { cursor } : {}),
    };
    yield input.output === "metadata"
      ? connectSuccess({
          ...common,
          output: "metadata" as const,
          results: rows.map((row) => metadataRecord(row, input.select)),
        })
      : connectSuccess({ ...common, results: rows });
    if (!cursor) {
      return;
    }
  }
}

/** Field-level writes. The SDK fills in base values and body edits from the view it was given. */
class NextWrites {
  constructor(
    private readonly db: MdbaseClient,
    private readonly options: NextReaderClientOptions,
  ) {}

  async create(input: CreateInput): Promise<RecordDocument> {
    const type = input.type ?? typeForContract(input.contract);
    const write = await this.db.create(
      {
        ...(type ? { type } : {}),
        ...(input.path ? { path: input.path } : {}),
        frontmatter: (input.frontmatter ?? {}) as Record<string, PlainValue>,
        ...(input.body === undefined ? {} : { body: input.body }),
      },
      {
        include: readInclude({
          includeBody: true,
          includeDocument: input.includeDocument ?? false,
        }),
      },
    );
    return recordDocument(await this.settle(write, input.path ?? "", false));
  }

  async update(input: UpdateInput): Promise<RecordDocument> {
    const replacing = input.document !== undefined;
    const current = await this.db.get(
      { path: input.path },
      { body: true, ...(replacing ? { document: true } : {}) },
    );
    const include = readInclude({
      includeBody: true,
      includeDocument: replacing || (input.includeDocument ?? false),
    });
    const cas = input.ifRevision ? { ifRevision: input.ifRevision } : {};
    const write =
      input.document !== undefined
        ? await this.db.replaceDocument(current, input.document, { ...cas, include })
        : await this.db.update(
            current,
            {
              patch: input.patch as Record<string, PlainValue>,
              ...(input.body === undefined ? {} : { body: input.body }),
              ...cas,
            },
            { include },
          );
    return recordDocument(await this.settle(write, input.path, Boolean(input.ifRevision), include));
  }

  /** A dry-run delete: the replica plans it without capturing anything. */
  async preflightDelete(input: DeleteInput): Promise<DeletePreflightResult> {
    const current = await this.db.get({ path: input.path });
    const write = await this.db.delete(current, {
      dryRun: true,
      ...(input.ifRevision ? { ifRevision: input.ifRevision } : {}),
    });
    await rejectedNow(write);
    // Backlink discovery has no equivalent in the client API yet: no broken links are reported.
    return { path: input.path, deleted: false, dryRun: true, wouldDelete: true } as const;
  }

  async delete(input: DeleteInput, progress: DeleteProgressOptions = {}): Promise<DeleteResult> {
    const started = Date.now();
    const report = (state: "applying" | "completed", completedUnits: number): void =>
      progress.onProgress?.({
        operation: "delete",
        state,
        elapsedMs: Date.now() - started,
        cancellable: false,
        resumed: false,
        completedUnits,
      });
    report("applying", 0);
    const current = await this.db.get({ path: input.path }, undefined, progress.signal);
    const write = await this.db.delete(current, {
      ...(input.ifRevision ? { ifRevision: input.ifRevision } : {}),
    });
    await rejectedNow(write);
    if (input.ifRevision && this.options.confirmCasWrites !== false) {
      await write.confirmed;
    } else {
      this.watch(write, input.path);
    }
    report("completed", 1);
    return { path: input.path, deleted: true };
  }

  /** The record a write produced: confirmed for CAS writes, otherwise optimistic. */
  private async settle(
    write: Write,
    path: string,
    cas: boolean,
    include?: Include,
  ): Promise<RecordView> {
    await rejectedNow(write);
    if (cas && this.options.confirmCasWrites !== false) {
      await write.confirmed;
      // Confirmed receipts carry no bodies: read the confirmed state back.
      return this.db.get(firstRecord(write.records).id, include);
    }
    this.watch(write, path);
    return firstRecord(write.records);
  }

  private watch(write: Write, path: string): void {
    write.confirmed.catch((error: unknown) => {
      if (isMdbaseError(error)) {
        this.options.onRejected?.(error, path);
      }
    });
  }
}

/** A receipt rejected at submit throws its problem now. */
async function rejectedNow(write: Write): Promise<void> {
  if (write.state === "rejected" || write.state === "unknown") {
    await write.confirmed;
  }
}

function firstRecord(records: readonly RecordView[]): RecordView {
  const [record] = records;
  if (!record) {
    throw mdbaseError("internal", "The replica returned no record for this write.");
  }
  return record;
}

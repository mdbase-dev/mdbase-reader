import { connectFailure, connectProblem, connectSuccess } from "@mdbase-dev/connect/advanced";
import { isMdbaseError, MdbaseError, toPlain } from "@mdbase-dev/sdk";

import type { ReaderConnectProblem } from "../validation-issues.js";
import type {
  ConnectOutcome,
  ConnectProblemCode,
  JsonObject,
  QueryInput,
  QueryMetadataInput,
  QueryMetadataRecord,
  QueryRecord,
  QueryResult,
  RecordDocument,
} from "@mdbase-dev/connect";
import type {
  ContractRecordView,
  Include,
  Query,
  QueryResult as NativeQueryResult,
  RecordView,
  Value,
} from "@mdbase-dev/sdk";

/** A native write whose outcome is not yet settled; carries its original mutation ID. */
export class OutcomeUnknown extends Error {
  constructor(readonly mutationId: string) {
    super("This change is not confirmed yet. Recover the original operation before retrying.");
    this.name = "OutcomeUnknown";
  }
}

export function unsupported(message: string): MdbaseError {
  return new MdbaseError({
    code: "invalid_request",
    recovery: "fix_request",
    reason: "unsupported",
    message,
  });
}

export function retired(): MdbaseError {
  return new MdbaseError({
    code: "cancelled",
    recovery: "none",
    message: "This collection is no longer open in mdbase Reader.",
  });
}

function hasUnsupportedQueryMembers(input: QueryInput | QueryMetadataInput): boolean {
  return (
    input.groupBy !== undefined ||
    input.summaries !== undefined ||
    input.summaryFunctions !== undefined ||
    input.snapshot !== undefined
  );
}

function selection(input: QueryInput | QueryMetadataInput): Query {
  const query: Query = {};
  if (input.projections) {
    query["projections"] = Object.fromEntries(
      Object.entries(input.projections).map(([name, projection]) => [
        name,
        { expr: projection.expression },
      ]),
    );
  }
  if (input.select) {
    query.select = input.select.map((item) =>
      typeof item === "string"
        ? item
        : {
            name: item.name,
            expr: item.expression,
            ...(item.label === undefined ? {} : { label: item.label }),
          },
    );
  }
  if (input.orderBy) {
    query.order_by = input.orderBy.map((order) => ({
      field: order.field,
      direction: order.direction ?? "asc",
    }));
  }
  return query;
}

/** Translate Reader's Connect query shape to the native spec-11 query, or refuse. */
export function nativeQuery(input: QueryInput | QueryMetadataInput): {
  query: Query;
  include: Include;
} {
  if (hasUnsupportedQueryMembers(input)) {
    throw unsupported("Grouped, summarized and snapshot queries are not used natively by Reader.");
  }
  const query: Query = {
    ...(input.types ? { types: [...input.types] } : {}),
    ...(input.where === undefined ? {} : { where: input.where }),
    ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
    ...(input.context ? { context: { this: { path: input.context.this.path } } } : {}),
    ...selection(input),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    ...(input.offset ? { offset: input.offset } : {}),
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
  };
  const metadata = input.output === "metadata";
  return {
    query,
    include: { effective: true, body: !metadata && input.includeBody === true },
  };
}

export function plain(value: ReadonlyMap<string, Value> | undefined): JsonObject {
  return value ? Object.fromEntries([...value].map(([key, item]) => [key, toPlain(item)])) : {};
}

export function fileMetadata(
  record: Pick<RecordView, "path"> & Partial<Pick<RecordView, "mtime">>,
): RecordDocument["file"] {
  const slash = record.path.lastIndexOf("/");
  const base = record.path.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  return {
    path: record.path,
    name: dot > 0 ? base.slice(0, dot) : base,
    folder: slash === -1 ? "" : record.path.slice(0, slash),
    ...(record.mtime === undefined ? {} : { mtime: new Date(record.mtime).toISOString() }),
  };
}

export function recordDocument(record: RecordView): RecordDocument {
  return {
    path: record.path,
    revision: record.revision,
    types: [...record.types],
    frontmatter: plain(record.frontmatter),
    effectiveFrontmatter: plain(record.effective ?? record.frontmatter),
    ...(record.body === undefined ? {} : { body: record.body }),
    ...(record.document === undefined ? {} : { document: record.document }),
    file: fileMetadata(record),
  };
}

/** A contract view as Connect returns it: contract fields, no body (prod parity). */
export function contractDocument(view: ContractRecordView): RecordDocument {
  const fields = plain(view.fields);
  return {
    path: view.path,
    revision: view.revision,
    types: [view.contract.type],
    frontmatter: fields,
    effectiveFrontmatter: fields,
    file: fileMetadata({ path: view.path }),
    contract: { ...view.contract },
  };
}

export function queryRecord(record: RecordView): QueryRecord {
  return {
    path: record.path,
    revision: record.revision,
    types: [...record.types],
    frontmatter: plain(record.frontmatter),
    effectiveFrontmatter: plain(record.effective ?? record.frontmatter),
    ...(record.body === undefined ? {} : { body: record.body }),
    file: fileMetadata(record),
    ...(record.values ? { values: plain(record.values) } : {}),
  };
}

export function metadataRecord(record: RecordView): QueryMetadataRecord {
  return {
    path: record.path,
    types: [...record.types],
    revision: record.revision,
    values: plain(record.values),
  };
}

export function resultMeta(
  result: Pick<NativeQueryResult, "cursor" | "hasMore" | "totalCount">,
): NonNullable<QueryResult["meta"]> {
  return {
    hasMore: result.hasMore ?? result.cursor !== undefined,
    ...(result.totalCount === undefined ? {} : { totalCount: result.totalCount }),
    ...(result.cursor ? { cursor: result.cursor } : {}),
  };
}

export function uniquePaths(values: readonly { path: string }[]): { path: string }[] {
  return [...new Set(values.map(({ path }) => path))].map((path) => ({ path }));
}

export async function outcome<Result>(
  operation: () => Promise<Result>,
): Promise<ConnectOutcome<Result>> {
  try {
    return connectSuccess(await operation());
  } catch (error) {
    return failure(error);
  }
}

export function failure(error: unknown): ConnectOutcome<never> {
  return connectFailure(connectProblemFor(error));
}

const PROBLEM_CODES: Readonly<Record<string, ConnectProblemCode>> = {
  not_found: "file_not_found",
  conflict: "concurrent_modification",
  cancelled: "operation_cancelled",
  unavailable: "temporarily_unavailable",
  rate_limited: "rate_limited",
  forbidden: "not_authorized",
  unauthenticated: "reconnect_required",
  collection_invalid: "collection_incompatible",
  upgrade_required: "connector_upgrade_required",
};

/** Map native SDK failures onto the Connect problem codes Reader already handles. */
export function connectProblemFor(error: unknown): ReaderConnectProblem {
  if (error instanceof OutcomeUnknown) {
    return connectProblem("operation_outcome_unknown", error.message, {
      details: { request_id: error.mutationId },
    });
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return connectProblem("timeout", error.message);
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return connectProblem("operation_cancelled", error.message);
  }
  if (!isMdbaseError(error)) {
    return connectProblem(
      "operation_failed",
      error instanceof Error ? error.message : "The collection operation failed.",
    );
  }
  const code =
    error.code === "invalid_request"
      ? error.reason === "unsupported"
        ? "unsupported_operation"
        : "invalid_request"
      : (PROBLEM_CODES[error.code] ?? "operation_failed");
  return {
    ...connectProblem(code as "operation_failed", error.message),
    ...(error.issues ? { issues: error.issues } : {}),
  };
}

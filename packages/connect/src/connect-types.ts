import type { Issue } from "@mdbase-dev/sdk";
import type { ReaderRequestOptions } from "@mdbase-reader/core";

/**
 * The Connect-shaped record, query and file values Reader's repositories exchange with
 * the native SDK adapters (`native/`). Reader owns them; they carry only what Reader uses.
 */

export type JsonObject = Record<string, unknown>;

/** The native SDK's submitted-record diagnostics. */
export type ConnectValidationIssue = Readonly<Issue>;

/** Why a collection operation failed. `code` is one of the Connect problem codes Reader handles. */
export interface ConnectProblem {
  readonly code: string;
  readonly message: string;
  /** `operation_outcome_unknown` carries the original write's `request_id`. */
  readonly details?: unknown;
  readonly issues?: readonly ConnectValidationIssue[];
  /**
   * The native SDK's own code and reason. The Connect code alone cannot tell a taken
   * path (`conflict` / `path_taken`) from a revision conflict (`conflict` / `revision`).
   */
  readonly native?: { readonly code: string; readonly reason?: string };
}

export interface ConnectSuccess<Value> {
  readonly ok: true;
  readonly value: Value;
}
export interface ConnectFailure {
  readonly ok: false;
  readonly problem: ConnectProblem;
}
/** Every expected failure is data; exceptions are programming errors. */
export type ConnectOutcome<Value> = ConnectSuccess<Value> | ConnectFailure;

export function connectSuccess<Value>(value: Value): ConnectSuccess<Value> {
  return { ok: true, value };
}

export function connectFailure(problem: ConnectProblem): ConnectFailure {
  return { ok: false, problem };
}

export function connectProblem(
  code: string,
  message: string,
  options: { readonly details?: unknown } = {},
): ConnectProblem {
  return { code, message, ...(options.details === undefined ? {} : { details: options.details }) };
}

export interface DataContractSelector {
  id: string;
  version: string;
  /** Required when several approved types implement the selected contract. */
  type?: string;
}

export interface DataContractViewIdentity {
  id: string;
  version: string;
  digest: string;
  type: string;
  implementationDigest: string;
}

export interface CollectionFileMetadata {
  path?: string;
  name?: string;
  folder?: string;
  mtime?: string;
}

export interface RecordDocument {
  path: string;
  revision: string;
  types: string[];
  frontmatter: JsonObject;
  effectiveFrontmatter: JsonObject;
  body?: string;
  document?: string;
  file: CollectionFileMetadata;
  contract?: DataContractViewIdentity;
}

export interface QueryRecord {
  path: string;
  revision?: string;
  frontmatter?: JsonObject;
  effectiveFrontmatter?: JsonObject;
  body?: string;
  types: string[];
  file: CollectionFileMetadata;
  /** Selected and projected values, keyed by output name, when the query used `select`. */
  values?: JsonObject;
  contract?: DataContractViewIdentity;
}

export interface ReadInput {
  path: string;
  /** Select an exact approved contract view. */
  contract?: DataContractSelector;
  includeDocument?: boolean;
}

export interface QueryProjection {
  expression: string;
}

export interface QuerySelectionExpression {
  name: string;
  expression: string;
  label?: string;
}

/** Reader's subset of the canonical mdbase v0.3 query. */
export interface QueryInput {
  output?: never;
  /** Contract queries accept only `types`, pagination, `frontmatterMode` and `contract`. */
  types?: string[];
  timezone?: string;
  context?: { this: { path: string } };
  projections?: Record<string, QueryProjection>;
  where?: string;
  select?: (string | QuerySelectionExpression)[];
  orderBy?: { field: string; direction?: "asc" | "desc" }[];
  limit?: number;
  offset?: number;
  cursor?: string;
  includeBody?: boolean;
  frontmatterMode?: "effective" | "persisted" | "both";
  contract?: DataContractSelector;
}

export type QueryMetadataInput = Omit<QueryInput, "output" | "includeBody"> & {
  output: "metadata";
  includeBody?: false;
};

/** Partial metadata is not a record document; revision and selected values are required. */
export interface QueryMetadataRecord {
  path: string;
  types: string[];
  revision: string;
  values: JsonObject;
}

export interface QueryMeta {
  totalCount?: number;
  hasMore: boolean;
  cursor?: string;
}

export interface QueryResult {
  results: QueryRecord[];
  meta?: QueryMeta;
}

export interface QueryPage<Row = QueryRecord> {
  results: Row[];
  meta?: QueryMeta;
  page: number;
  offset: number;
  loaded: number;
  complete: boolean;
  cursor?: string;
}

export type QueryMetadataPage = QueryPage<QueryMetadataRecord> & { output: "metadata" };

export interface ReadManyOptions extends ReaderRequestOptions {
  includeBody?: boolean;
  /** Restrict matching records to these raw collection types. */
  types?: string[];
  concurrency?: number;
}

export type ReadManyRecord = QueryRecord;

export interface ReadManyResult {
  /** One entry per input path, in input order, including duplicates. */
  results: (
    { status: "found"; path: string; record: ReadManyRecord } | { status: "missing"; path: string }
  )[];
}

export interface CreateInput {
  path?: string;
  type?: string;
  contract?: DataContractSelector;
  frontmatter?: JsonObject;
  body?: string;
  ifRevision?: string;
  includeDocument?: boolean;
}

interface UpdateInputBase {
  path: string;
  contract?: DataContractSelector;
  ifRevision?: string;
  includeDocument?: boolean;
}

export type UpdateInput = UpdateInputBase &
  (
    | { patch: JsonObject; body?: string; document?: never }
    | {
        /** Replace the complete Markdown source; exclusive with `patch` and `body`. */
        document: string;
        patch?: never;
        body?: never;
      }
  );

export interface DeleteInput {
  path: string;
  contract?: DataContractSelector;
  checkBacklinks?: boolean;
  ifRevision?: string;
}

export interface DeleteResult {
  path: string;
  deleted: boolean;
  brokenLinks?: { path: string }[];
}

export interface DeletePreflightResult {
  path: string;
  deleted: false;
  dryRun: true;
  wouldDelete: true;
  brokenLinks?: { path: string }[];
}

export interface DeleteProgress {
  operation: "delete";
  state: "preflighting" | "applying" | "completed";
  elapsedMs: number;
  cancellable: boolean;
  resumed: boolean;
  completedUnits: number;
}

export interface DeleteProgressOptions {
  signal?: AbortSignal;
  onProgress?: (progress: DeleteProgress) => void;
  /** The preview already shown to the user; a delete that would break more links is refused. */
  preflight?: DeletePreflightResult;
}

export interface ExecuteViewInput {
  path: string;
  view: string;
  timezone?: string;
  context?: { path: string } | null;
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface SavedViewPresentation extends JsonObject {
  type: string;
  fallback?: string;
  mappings?: Record<string, string>;
  options?: JsonObject;
}

export interface SavedViewList {
  views: {
    id: string;
    name: string;
    source: { path: string; format: string; revision: string; writable: boolean };
    views: {
      id: string;
      name: string;
      properties: {
        key: string;
        label?: string;
        description?: string;
        format?: string;
        hidden?: boolean;
      }[];
      presentation?: SavedViewPresentation;
    }[];
  }[];
  meta: { totalCount: number };
}

export interface SavedViewExecution {
  results: (Omit<QueryRecord, "effectiveFrontmatter"> & { effectiveFrontmatter: JsonObject })[];
  meta: {
    totalCount: number;
    hasMore: boolean;
    cursor?: string;
    view: { path: string; id: string };
    context?: { path: string };
    groups?: { values: JsonObject; count: number; summaries: JsonObject }[];
  };
}

export interface CollectionFileDescriptor {
  fileId: string;
  path: string;
  revision: string;
  contentDigest: `sha256:${string}`;
  size: number;
  mediaType?: string;
  mediaClass: string;
  modifiedAt: string;
}

export type FileStatTarget = { path: string; fileId?: never } | { path?: never; fileId: string };

export interface FileListOptions {
  signal?: AbortSignal;
  folder?: string;
  pageSize?: number;
}

export interface FileUploadOptions {
  signal?: AbortSignal;
  mediaType?: string;
  /** Stable retry key: reusing it resumes or replays the same transfer. */
  transferId?: string;
  onProgress?: (progress: { transferredBytes: number; totalBytes: number }) => void;
}

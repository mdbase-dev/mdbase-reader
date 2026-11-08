// Reader applications reach the SDK through this package only.
import {
  connectFailure,
  connectProblem,
  connectSuccess,
  type ConnectFailure,
  type ConnectOutcome,
  type ConnectProblem,
  type JsonObject,
} from "./connect-types.js";
import { ConnectRepositoryError } from "./repository-client.js";

/**
 * - `saved`: the draft is the acknowledged record.
 * - `unsaved`: local changes wait for autosave, `save()` or `flush()`.
 * - `saving`: a write or exact recovery is in flight.
 * - `conflict`: a newer record changed what was edited locally; see `remote`.
 * - `recovery`: a write's outcome is unknown; no new write is sent until it is recovered.
 * - `error`: a write or refresh failed; local changes and the last accepted record are kept.
 * - `deleted`: the record no longer exists; local changes are kept.
 */
export type ReaderRecordSessionState =
  "saved" | "unsaved" | "saving" | "conflict" | "recovery" | "error" | "deleted";

/** The parts of a record a session writes. Only locally changed parts are present. */
export interface ReaderRecordChange {
  body?: string;
  patch?: JsonObject;
}

/**
 * How a session reads and writes one record. `R` is the application's record
 * value; the session reads it only through these accessors. Every expected
 * failure is a `ConnectOutcome` failure; an adapter that throws has a bug.
 */
export interface ReaderRecordSessionAdapter<R> {
  revision(record: R): string;
  body(record: R): string;
  frontmatter?(record: R): JsonObject;
  /** Apply `change` to the record at `base`'s revision, or fail without writing. */
  write(base: R, change: ReaderRecordChange): Promise<ConnectOutcome<R>>;
  /** The current record. A `file_not_found` failure means it was deleted. */
  read?: (base: R) => Promise<ConnectOutcome<R>>;
  /** Exact continuation of a write whose outcome is unknown. Never a new write. */
  recover?: (requestId: string) => Promise<ConnectOutcome<R>>;
  /** Whether that write's durable pending mutation is still unsettled. */
  isPending?(requestId: string): boolean;
}

export interface ReaderRecordSessionSnapshot<R> {
  readonly state: ReaderRecordSessionState;
  readonly body: string;
  /** The record's frontmatter with local patches applied. */
  readonly frontmatter: JsonObject;
  /** The latest record this session has accepted as its base. */
  readonly record: R;
  /** The newer record that conflicts with local changes, while `state` is `conflict`. */
  readonly remote: R | null;
  /** Local changes not yet acknowledged, including a write in flight or awaiting recovery. */
  readonly dirty: boolean;
  /** Why a write, recovery or refresh failed. */
  readonly problem: ConnectProblem | null;
  /** The interrupted write's request ID, while `state` is `recovery`. */
  readonly pendingRequestId?: string;
}

export type ReaderRecordResolution = { keep: "mine" | "theirs" } | { body: string };

interface PendingWrite {
  readonly requestId: string;
  /** What the interrupted write sent, or `restored` when it predates this session. */
  readonly sent: ReaderRecordChange | "restored";
}

/**
 * One open, editable record: debounced autosave, one write queue, own
 * acknowledgements recognized by revision after each write settles,
 * field-level conflict detection, and exact recovery of writes whose outcome
 * is unknown. Share one session between every view of the same record.
 */
export class ReaderRecordSession<R> {
  #record: R;
  /** The local text `#record` acknowledges; it differs from the record's body after normalization. */
  #baseBody: string;
  #body: string;
  #patch: JsonObject = {};
  #remote: R | null = null;
  #problem: ConnectProblem | null = null;
  // Editing/discarding a draft cannot establish freshness after a failed read.
  #refreshProblem: ConnectProblem | null = null;
  #deleted = false;
  #busy = false;
  #pending: PendingWrite | undefined;
  #incoming: R[] = [];
  readonly #seen = new Set<string>();
  readonly #listeners = new Set<() => void>();
  #tail: Promise<void> = Promise.resolve();
  #queued = 0;
  #inFlight: Promise<ConnectOutcome<R>> | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #lastEdit = 0;
  readonly #idleMs: number | undefined;
  #current: ReaderRecordSessionSnapshot<R>;

  constructor(
    record: R,
    private readonly adapter: ReaderRecordSessionAdapter<R>,
    options: { readonly autosave?: { readonly idleMs: number } | false } = {},
  ) {
    this.#record = record;
    this.#baseBody = this.#body = adapter.body(record);
    this.#seen.add(adapter.revision(record));
    this.#idleMs = options.autosave === false ? undefined : (options.autosave?.idleMs ?? 1000);
    this.#current = this.#compute();
  }

  get snapshot(): ReaderRecordSessionSnapshot<R> {
    return this.#current;
  }

  /** Listeners run synchronously after every change, including each edit. */
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  };

  setBody(body: string): void {
    if (body === this.#body) {
      return;
    }
    this.#body = body;
    this.#edited();
  }

  patchFrontmatter(patch: JsonObject): void {
    this.#patch = { ...this.#patch, ...patch };
    this.#edited();
  }

  /**
   * Offer a draft kept outside the session, such as a crash-recovery copy. It
   * is never written by itself: call `autosave()` or `save()`. A draft whose
   * base is unknown or has since changed is a conflict with the current record.
   */
  restore(draft: {
    body: string;
    baseBody?: string;
    patch?: JsonObject;
    baseFrontmatter?: JsonObject;
  }): void {
    const current = this.adapter.body(this.#record);
    const frontmatter = this.adapter.frontmatter?.(this.#record) ?? {};
    const patch = Object.fromEntries(
      Object.entries(draft.patch ?? {}).filter(
        ([key, value]) => JSON.stringify(frontmatter[key] ?? null) !== JSON.stringify(value),
      ),
    );
    if (draft.body === current && Object.keys(patch).length === 0) {
      return;
    }
    this.#body = draft.body;
    this.#patch = patch;
    if (
      (draft.body !== current && draft.baseBody !== current) ||
      Object.keys(patch).some(
        (key) =>
          !draft.baseFrontmatter ||
          JSON.stringify(draft.baseFrontmatter[key] ?? null) !==
            JSON.stringify(frontmatter[key] ?? null),
      )
    ) {
      this.#remote = this.#record;
    }
    this.#emit();
  }

  /**
   * Continue a write interrupted before this session existed, such as one
   * found in durable storage after a reload. No new write is sent until it
   * settles; with autosave, recovery is attempted after one idle interval.
   */
  resumeRecovery(requestId: string): void {
    if (this.#pending || this.#busy) {
      return;
    }
    this.#pending = { requestId, sent: "restored" };
    this.#emit();
    this.autosave();
  }

  /** Schedule an autosave one idle interval from now. */
  autosave(): void {
    this.#lastEdit = Date.now();
    this.#schedule();
  }

  /**
   * A record published by another view or cache. It may be stale, so a
   * revision this session has already seen is ignored, and records arriving
   * while a write is unsettled wait until that write's acknowledgement is known.
   */
  receive(record: R): void {
    if (this.#seen.has(this.adapter.revision(record))) {
      return;
    }
    if (this.#busy || this.#pending) {
      this.#incoming.push(record);
      return;
    }
    this.#seen.add(this.adapter.revision(record));
    this.#classify(record);
    this.#emit();
  }

  /**
   * Read the current record after any queued write and apply it. Unlike a
   * publication this is never stale, so a revision seen before is still
   * applied (revisions repeat when content is reverted).
   */
  refresh(): Promise<ConnectOutcome<R>> {
    return this.run(async () => {
      if (!this.adapter.read || this.#pending) {
        return connectSuccess(this.#record);
      }
      const outcome = await this.adapter.read(this.#record);
      if (!outcome.ok) {
        if (outcome.problem.code === "file_not_found") {
          this.markDeleted();
        } else {
          this.#refreshProblem = outcome.problem;
          this.#emit();
        }
        return outcome;
      }
      this.#refreshProblem = null;
      this.#seen.add(this.adapter.revision(outcome.value));
      this.#classify(outcome.value);
      this.#emit();
      return connectSuccess(this.#record);
    });
  }

  markDeleted(): void {
    clearTimeout(this.#timer);
    this.#deleted = true;
    this.#emit();
  }

  /**
   * Write local changes now, or continue an interrupted write's exact
   * recovery. Joins a save already in flight. Resolves with the accepted record.
   */
  save(): Promise<ConnectOutcome<R>> {
    clearTimeout(this.#timer);
    if (this.#inFlight) {
      return this.#inFlight;
    }
    const write = this.run(() =>
      this.#pending ? this.#recoverPending(this.#pending) : this.#write(true),
    );
    this.#inFlight = write;
    const settle = (): void => {
      if (this.#inFlight === write) {
        this.#inFlight = undefined;
      }
    };
    write.then(settle, settle);
    return write;
  }

  /** Save until every local change is acknowledged, or report why it cannot be. */
  async flush(): Promise<ConnectOutcome<R>> {
    for (;;) {
      if (this.#deleted) {
        return connectFailure(deletedProblem());
      }
      if (this.#remote) {
        return connectFailure(conflictProblem());
      }
      if (!this.#inFlight && !this.#pending && !this.#dirtyLocally()) {
        return connectSuccess(this.#record);
      }
      const saved = await this.save();
      if (!saved.ok) {
        return saved;
      }
    }
  }

  /** Run another operation on this record (rename, delete, …) in the session's write queue. */
  run<Result>(operation: () => Promise<Result>): Promise<Result> {
    // An idle queue starts synchronously, so a write is in flight before the caller's next edit.
    const result = this.#queued === 0 ? operation() : this.#tail.then(operation);
    this.#queued += 1;
    const done = (): void => {
      this.#queued -= 1;
    };
    this.#tail = result.then(done, done);
    return result;
  }

  /** Settle a conflict: keep local changes on top of the remote record, take the remote record, or use merged text. */
  resolve(choice: ReaderRecordResolution): void {
    const remote = this.#remote;
    if (!remote || this.#busy) {
      return;
    }
    this.#record = remote;
    this.#remote = null;
    this.#problem = null;
    this.#baseBody = this.adapter.body(remote);
    if ("body" in choice) {
      this.#body = choice.body;
    } else if (choice.keep === "theirs") {
      this.#body = this.#baseBody;
      this.#patch = {};
    }
    this.#emit();
    if (this.#dirtyLocally()) {
      this.autosave();
    }
  }

  /** Drop local changes and return to the latest record. */
  discard(): void {
    if (this.#busy) {
      return;
    }
    clearTimeout(this.#timer);
    this.#record = this.#remote ?? this.#record;
    this.#remote = null;
    this.#problem = null;
    this.#baseBody = this.#body = this.adapter.body(this.#record);
    this.#patch = {};
    this.#emit();
  }

  /**
   * Accept a record recovered from a write that predates this session. It is
   * never a conflict: local changes made meanwhile are kept on top of it.
   */
  #accept(record: R): void {
    this.#seen.add(this.adapter.revision(record));
    const body = this.adapter.body(record);
    if (this.#body === this.#baseBody) {
      this.#body = body;
    }
    this.#baseBody = body;
    const matter = this.adapter.frontmatter?.(record) ?? {};
    this.#patch = withoutPatch(this.#patch, (key, value) => sameJson(matter[key], value));
    this.#record = record;
    this.#remote = null;
    this.#problem = null;
    this.#refreshProblem = null;
  }

  #edited(): void {
    this.#problem = null;
    this.#lastEdit = Date.now();
    this.#emit();
    this.#schedule();
  }

  #schedule(): void {
    clearTimeout(this.#timer);
    if (this.#idleMs === undefined || this.#remote || this.#deleted) {
      return;
    }
    const delay = Math.max(0, this.#lastEdit + this.#idleMs - Date.now());
    this.#timer = setTimeout(() => void this.save(), delay);
  }

  #dirtyLocally(): boolean {
    return this.#body !== this.#baseBody || Object.keys(this.#patch).length > 0;
  }

  async #write(rebaseOnRejection: boolean): Promise<ConnectOutcome<R>> {
    if (this.#remote) {
      return connectFailure(conflictProblem());
    }
    if (this.#deleted) {
      return connectFailure(deletedProblem());
    }
    if (!this.#dirtyLocally()) {
      return connectSuccess(this.#record);
    }
    const sent: ReaderRecordChange = {};
    if (this.#body !== this.#baseBody) {
      sent.body = this.#body;
    }
    if (Object.keys(this.#patch).length) {
      sent.patch = structuredClone(this.#patch);
    }
    this.#busy = true;
    this.#emit();
    const outcome = await this.#guard(() => this.adapter.write(this.#record, { ...sent }));
    if (outcome.ok) {
      this.#acknowledge(outcome.value, sent);
      return connectSuccess(this.#record);
    }
    const requestId = outcomeUnknownRequestId(outcome.problem);
    if (requestId) {
      this.#busy = false;
      this.#problem = outcome.problem;
      this.#pending = { requestId, sent };
      this.#emit();
      this.#schedule();
      return outcome;
    }
    const classified = await this.#classifyFailure(outcome.problem);
    if (classified === "resolved") {
      return connectSuccess(this.#record);
    }
    if (classified === "rebased" && rebaseOnRejection) {
      return this.#write(false);
    }
    return this.#failure(outcome.problem);
  }

  async #recoverPending(pending: PendingWrite): Promise<ConnectOutcome<R>> {
    const recover = this.adapter.recover;
    if (!recover) {
      return connectFailure(
        connectProblem(
          "pending_mutation_unresolved",
          "Exact recovery of the interrupted write is unavailable. No new write was attempted.",
        ),
      );
    }
    this.#busy = true;
    this.#emit();
    const outcome = await this.#guard(() => recover(pending.requestId));
    if (outcome.ok) {
      if (pending.sent === "restored") {
        // Unknown content, so accept it like an out-of-band result: newer typing is kept.
        this.#pending = undefined;
        this.#accept(outcome.value);
        this.#settle();
      } else {
        this.#acknowledge(outcome.value, pending.sent);
      }
      return connectSuccess(this.#record);
    }
    // Only the SDK settling its durable handle proves the original intent was resolved.
    const settled =
      outcome.problem.code !== "operation_outcome_unknown" &&
      this.adapter.isPending?.(pending.requestId) === false;
    if (!settled) {
      this.#busy = false;
      this.#problem = outcome.problem;
      this.#emit();
      return outcome;
    }
    this.#pending = undefined;
    await this.#classifyFailure(outcome.problem);
    return this.#failure(outcome.problem);
  }

  /** An adapter that throws breaks its contract: rethrow, but leave the queue usable. */
  async #guard<Value>(call: () => Promise<Value>): Promise<Value> {
    try {
      return await call();
    } catch (error) {
      this.#busy = false;
      this.#emit();
      throw error;
    }
  }

  #failure(problem: ConnectProblem): ConnectFailure {
    if (this.#deleted) {
      return connectFailure(deletedProblem());
    }
    if (this.#remote) {
      return connectFailure(conflictProblem());
    }
    return connectFailure(problem);
  }

  #acknowledge(result: R, sent: ReaderRecordChange): void {
    this.#seen.add(this.adapter.revision(result));
    this.#record = result;
    if (sent.body !== undefined) {
      this.#baseBody = sent.body;
    }
    const sentPatch = sent.patch ?? {};
    this.#patch = withoutPatch(
      this.#patch,
      (key, value) => key in sentPatch && sameJson(sentPatch[key], value),
    );
    this.#problem = null;
    this.#refreshProblem = null;
    this.#pending = undefined;
    this.#settle();
    if (this.#dirtyLocally()) {
      this.#schedule();
    }
  }

  /** Read once to learn whether a failed write met a conflict, a convergent edit or deletion. */
  async #classifyFailure(problem: ConnectProblem): Promise<"failed" | "rebased" | "resolved"> {
    const base = this.adapter.revision(this.#record);
    const read = this.adapter.read;
    const outcome = read ? await this.#guard(() => read(this.#record)) : undefined;
    if (outcome && !outcome.ok && outcome.problem.code === "file_not_found") {
      this.#deleted = true;
      this.#settle();
      return "failed";
    }
    if (!outcome?.ok || this.adapter.revision(outcome.value) === base) {
      this.#problem = problem;
      this.#settle();
      return "failed";
    }
    this.#seen.add(this.adapter.revision(outcome.value));
    this.#classify(outcome.value);
    this.#settle();
    if (this.#remote) {
      return "failed";
    }
    return this.#dirtyLocally() ? "rebased" : "resolved";
  }

  #settle(): void {
    this.#busy = false;
    for (const record of this.#incoming.splice(0)) {
      if (this.#seen.has(this.adapter.revision(record))) {
        continue;
      }
      this.#seen.add(this.adapter.revision(record));
      this.#classify(record);
    }
    this.#emit();
  }

  /** Field-level three-way comparison of a newer record with the base and local changes. */
  #classify(record: R): void {
    if (this.adapter.revision(record) === this.adapter.revision(this.#record)) {
      return;
    }
    const baseBody = this.adapter.body(this.#record);
    const remoteBody = this.adapter.body(record);
    const bodyChanged = remoteBody !== baseBody;
    const bodyDirty = this.#body !== this.#baseBody;
    const baseMatter = this.adapter.frontmatter?.(this.#record) ?? {};
    const remoteMatter = this.adapter.frontmatter?.(record) ?? {};
    const conflict =
      (bodyDirty && bodyChanged && remoteBody !== this.#body) ||
      Object.entries(this.#patch).some(
        ([key, value]) =>
          !sameJson(remoteMatter[key], baseMatter[key]) && !sameJson(remoteMatter[key], value),
      );
    if (conflict) {
      clearTimeout(this.#timer);
      this.#remote = record;
      return;
    }
    this.#remote = null;
    this.#record = record;
    // Not a conflict, so a changed remote body either replaces a clean draft or equals it.
    if (bodyChanged) {
      this.#baseBody = this.#body = remoteBody;
    }
    this.#patch = withoutPatch(this.#patch, (key, value) => sameJson(remoteMatter[key], value));
    if (!this.#dirtyLocally()) {
      this.#problem = null;
    }
  }

  #compute(): ReaderRecordSessionSnapshot<R> {
    const dirty = this.#busy || Boolean(this.#pending) || this.#dirtyLocally();
    const state: ReaderRecordSessionState = this.#deleted
      ? "deleted"
      : this.#remote
        ? "conflict"
        : this.#busy
          ? "saving"
          : this.#pending
            ? "recovery"
            : this.#problem || this.#refreshProblem
              ? "error"
              : dirty
                ? "unsaved"
                : "saved";
    return {
      state,
      body: this.#body,
      frontmatter: { ...(this.adapter.frontmatter?.(this.#record) ?? {}), ...this.#patch },
      record: this.#record,
      remote: this.#remote,
      dirty,
      problem: this.#problem ?? this.#refreshProblem,
      ...(this.#pending ? { pendingRequestId: this.#pending.requestId } : {}),
    };
  }

  #emit(): void {
    this.#current = this.#compute();
    this.#listeners.forEach((listener) => listener());
  }
}

function conflictProblem(): ConnectProblem {
  return connectProblem(
    "concurrent_modification",
    "This record changed elsewhere. Local changes are kept until the conflict is resolved.",
  );
}

function deletedProblem(): ConnectProblem {
  return connectProblem("file_not_found", "This record no longer exists. Local changes are kept.");
}

function outcomeUnknownRequestId(problem: ConnectProblem): string | undefined {
  if (problem.code !== "operation_outcome_unknown") {
    return undefined;
  }
  const requestId = (problem.details as { request_id?: unknown } | undefined)?.request_id;
  return typeof requestId === "string" ? requestId : undefined;
}

/** The patch without the entries `acknowledged` accepts. */
function withoutPatch(
  patch: JsonObject,
  acknowledged: (key: string, value: unknown) => boolean,
): JsonObject {
  return Object.fromEntries(
    Object.entries(patch).filter(([key, value]) => !acknowledged(key, value)),
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameJson(value, right[index]))
    );
  }
  const leftObject = left as JsonObject;
  const rightObject = right as JsonObject;
  const keys = Object.keys(leftObject);
  return (
    keys.length === Object.keys(rightObject).length &&
    keys.every((key) => key in rightObject && sameJson(leftObject[key], rightObject[key]))
  );
}

/**
 * Reader's repositories and gateways report failures by throwing; record
 * session adapters report them as outcomes. A repository failure keeps its
 * Connect problem (and so an interrupted write's request ID) with Reader's
 * message; any other error is an operation failure with its own message.
 */
export function recordFailure(error: unknown): ConnectFailure {
  if (error instanceof ConnectRepositoryError && error.problem) {
    return connectFailure({ ...error.problem, message: error.message });
  }
  if (error instanceof Error) {
    return connectFailure(connectProblem("operation_failed", error.message));
  }
  throw error;
}

/** A missing record, as record sessions expect to learn of deletion. */
export function recordMissing(): ConnectFailure {
  return connectFailure(connectProblem("file_not_found", "This record no longer exists."));
}

/** Run a throwing read or recovery as a record session outcome; `null` means deleted. */
export async function recordOutcome<Value>(
  operation: () => Promise<Value | null>,
): Promise<ConnectOutcome<Value>> {
  try {
    const value = await operation();
    return value === null ? recordMissing() : connectSuccess(value);
  } catch (error) {
    return recordFailure(error);
  }
}

export function recordSuccess<Value>(value: Value): ConnectOutcome<Value> {
  return connectSuccess(value);
}

/** The record changed since the base a write was prepared against. */
export function recordChanged(message: string): ConnectFailure {
  return connectFailure(connectProblem("concurrent_modification", message));
}

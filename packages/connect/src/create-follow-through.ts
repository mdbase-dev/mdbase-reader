import { connectFailure, connectProblem, connectSuccess } from "@mdbase-dev/connect/advanced";
import { uuidv7 } from "@mdbase-dev/sdk";

import {
  recordPathById,
  type ReaderConnectClient,
  type ReaderCreateReceipt,
  type ReaderCreateTracking,
} from "./repository-client.js";
import { isIdExists, isPathTaken, type ReaderConnectProblem } from "./validation-issues.js";

import type { ConnectOutcome, ReadInput, RecordDocument } from "@mdbase-dev/connect";
import type {
  CreateJournal,
  PendingCreate,
  PendingCreateAttention,
  PendingCreateKind,
  PendingRelink,
  ReaderRequestOptions,
} from "@mdbase-reader/core";

/*
 * Create follow-through (docs/design/file-layout.md §4, slice 5).
 *
 * A native create can return while the log has not decided it: the adapter waits a few
 * seconds for the receipt, then reports the optimistic record as saved on this device.
 * The log can still refuse it when it reaches head. An explicit path that another record
 * took first is `conflict` / `path_taken` (`intent.md` §3.1, "decided at head"), the
 * receipt moves `pending → rejected`, and "the local view drops the mutation"
 * (`replica-client-api.md` §6). Writes made to the record while it was pending (edits,
 * a delete) are refused with it, since they name a record the log never had. Records
 * have no create-if-absent, so two devices that save the same name offline lose the
 * second record unless someone looks.
 *
 * This keeps every create in a device journal until it is confirmed, and reconciles the
 * journal on startup, on reconnect, when the replica catches up and when receipts arrive:
 *
 *   submitting ──► pending ──► confirmed ──► (removed)
 *        │            │  │          ▲  └─ kept while a record it links to is unconfirmed
 *        │            │  └─ gone from the local view: deleted here ─► (removed)
 *        │            ├── rejected path_taken ─► next candidate (new intent) ─► submitting
 *        │            └── rejected otherwise, or out of candidates ─► needs-attention
 *        └── outcome unknown ─► pending (settled later by receipt or by its `id`)
 *
 * While pending, each pass copies the record's current content from the local view into
 * the entry, so a create written again after a refusal carries the user's later edits.
 *
 * A retry under the same intent resends the first attempt's mutation, and "the first
 * attempt's content wins" (SDK `client.d.ts` `WriteOptions.intent`); the log keeps the
 * mutation's identity, so a resend of a write it already took lands once. Every state
 * that is not definite (no receipt, `unknown`, `missing`) is therefore resent under its
 * own intent. Only a refusal of that exact mutation starts a new write under a new
 * intent: the key for the first, then `key:n`.
 */

/** One record create to follow through. */
export interface FollowedCreate {
  readonly key: string;
  readonly collectionId: string;
  readonly kind: PendingCreateKind;
  /** The record's Reader `id` field. */
  readonly recordId: string;
  readonly label: string;
  /** Paths to try in order; later ones are used when earlier ones are taken. */
  readonly candidates: readonly string[];
  readonly input: PendingCreate["input"];
  /** How a record already at a candidate path is read to see whether it is this one. */
  readonly readBack?: Omit<ReadInput, "path">;
  /** Whether a record read back is an earlier attempt of this create (default: same `id`). */
  readonly isOurs?: (document: RecordDocument) => boolean;
}

/** A create the user has to look at. Its content is still kept on this device. */
export interface CreateAttention {
  readonly key: string;
  readonly kind: PendingCreateKind;
  readonly label: string;
  readonly reason: PendingCreateAttention;
  readonly problem: string;
}

export interface CreateFollowThroughSnapshot {
  /** Creates waiting for the collection to confirm them. */
  readonly waiting: number;
  readonly attention: readonly CreateAttention[];
}

/** What the app shows: creates that need the user, and what the user can do about them. */
export interface ReaderCreateFollowThrough {
  getSnapshot(): CreateFollowThroughSnapshot;
  subscribe(listener: () => void): () => void;
  /** Settle what can be settled now. With `retry`, also write again what needs attention. */
  reconcile(options?: { readonly retry?: boolean }): Promise<void>;
  /** Let go of a create that needs the user. Its content is removed from this device. */
  discard(key: string): Promise<void>;
}

type Submitted =
  | { readonly kind: "settled" | "waiting"; readonly outcome: ConnectOutcome<RecordDocument> }
  | {
      readonly kind: "refused";
      readonly outcome: Extract<ConnectOutcome<RecordDocument>, { readonly ok: false }>;
      readonly entry: PendingCreate;
      readonly exhausted: boolean;
    };

/** Changes to an entry. `undefined` removes a field. */
type EntryChange = { -readonly [Key in keyof PendingCreate]?: PendingCreate[Key] | undefined };

const EMPTY: CreateFollowThroughSnapshot = { waiting: 0, attention: [] };

/** How often a moved link may fail to reach a dependent record before it is let go. */
const MAX_RELINK_TRIES = 5;

/** Native codes that mean "not now" rather than "no" (`replica-client-api.md` §9). */
const TRANSIENT_NATIVE = new Set(["unavailable", "rate_limited", "cancelled", "unauthenticated"]);
const TRANSIENT_CONNECT = new Set([
  "temporarily_unavailable",
  "timeout",
  "operation_cancelled",
  "rate_limited",
  "reconnect_required",
  "connector_offline",
  "relay_unavailable",
]);

/** The fields that make a new write: a new intent, with nothing known about it yet. */
const NEW_WRITE: EntryChange = {
  state: "submitting",
  mutationId: undefined,
  replicaId: undefined,
  problem: undefined,
  attention: undefined,
};

export class CreateFollowThrough implements ReaderCreateFollowThrough {
  readonly #records: ReaderConnectClient;
  readonly #journal: CreateJournal | null;
  readonly #collectionId: string | null;
  readonly #now: () => string;
  /** Creates this instance is writing right now; the reconciler leaves them alone. */
  readonly #active = new Set<string>();
  /** Creates let go of (deleted or discarded); a write still in flight never brings them back. */
  readonly #forgotten = new Set<string>();
  /** Old path stem → new stem, for links made from a stale copy of a moved record. */
  readonly #moves = new Map<string, string>();
  readonly #listeners = new Set<() => void>();
  #snapshot: CreateFollowThroughSnapshot = EMPTY;
  #running: Promise<void> | null = null;
  #again = false;
  #retry = false;

  constructor(
    records: ReaderConnectClient,
    options: {
      /** Absent: creates are still tried at each candidate, but nothing is kept. */
      readonly journal?: CreateJournal;
      /** The collection whose journal entries `reconcile` settles. */
      readonly collectionId?: string;
      readonly now?: () => string;
    } = {},
  ) {
    this.#records = records;
    this.#journal = options.journal ?? null;
    this.#collectionId = options.collectionId ?? null;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  getSnapshot(): CreateFollowThroughSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Create at the first free candidate. The entry stays in the journal until the
   * collection confirms it; a create refused right away is returned as a failure for
   * the caller to show, and is not kept. When the journal cannot be written (storage
   * full, say), the create is still made, untracked.
   */
  async create(
    request: FollowedCreate,
    options: ReaderRequestOptions = {},
  ): Promise<ConnectOutcome<RecordDocument>> {
    this.#active.add(request.key);
    this.#forgotten.delete(request.key);
    try {
      const frontmatter = this.#followMoves(request.input.frontmatter);
      const dependsOn = await this.#parentsOf(request.collectionId, request.key, frontmatter);
      const entry: PendingCreate = {
        key: request.key,
        collectionId: request.collectionId,
        kind: request.kind,
        recordId: request.recordId,
        label: request.label,
        candidates: [...new Set(request.candidates)],
        attempt: 0,
        submission: 0,
        input: { ...request.input, frontmatter },
        ...(dependsOn.length > 0 ? { dependsOn } : {}),
        state: "submitting",
        startedAt: this.#now(),
      };
      // This create's content wins over anything an earlier save under the key left.
      await this.#put(entry);
      const submitted = await this.#submit(entry, request, options);
      if (submitted.kind === "refused") {
        await this.#remove(submitted.entry);
      }
      return submitted.outcome;
    } finally {
      this.#active.delete(request.key);
      await this.#refresh();
    }
  }

  /**
   * The user deleted the record with Reader `id` `recordId`: keep nothing that would
   * write it again. Call after a delete succeeds; the delete may be refused at head
   * along with a pending create, and the create must not come back.
   */
  async forget(recordId: string): Promise<void> {
    const journal = this.#journal;
    const collectionId = this.#collectionId;
    if (!journal || collectionId === null) {
      return;
    }
    try {
      for (const entry of await journal.list(collectionId)) {
        if (entry.recordId === recordId) {
          this.#forgotten.add(entry.key);
          await this.#remove(entry);
        }
      }
    } catch {
      // The journal could not be read. A pending create is still let go of when the
      // reconciler sees it gone from the local view.
    }
    await this.#refresh();
  }

  async discard(key: string): Promise<void> {
    const collectionId = this.#collectionId;
    if (collectionId === null) {
      return;
    }
    this.#forgotten.add(key);
    try {
      await this.#journal?.remove(collectionId, key);
    } finally {
      await this.#refresh();
    }
  }

  reconcile(options: { readonly retry?: boolean } = {}): Promise<void> {
    if (options.retry) {
      this.#retry = true;
    }
    if (this.#running) {
      this.#again = true;
      return this.#running;
    }
    this.#running = (async () => {
      do {
        this.#again = false;
        const retry = this.#retry;
        this.#retry = false;
        await this.#pass(retry);
        // `#pass` may set it again while it runs.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      } while (this.#again);
    })().finally(() => {
      this.#running = null;
    });
    return this.#running;
  }

  async #pass(retry: boolean): Promise<void> {
    const journal = this.#journal;
    const collectionId = this.#collectionId;
    if (!journal || collectionId === null) {
      return;
    }
    try {
      for (const listed of await journal.list(collectionId)) {
        if (this.#active.has(listed.key)) {
          continue;
        }
        // An earlier step of this pass may have changed it (a moved link, for one).
        const entry = await journal.get(collectionId, listed.key);
        if (!entry || (entry.state === "needs-attention" && !retry)) {
          continue;
        }
        this.#active.add(entry.key);
        try {
          await this.#settle(entry);
        } catch {
          // Offline, or the scope closed: the entry is left for the next pass.
        } finally {
          this.#active.delete(entry.key);
        }
      }
      await this.#sweep(collectionId);
    } catch {
      // The journal itself could not be read; the next trigger tries again.
    }
    await this.#refresh();
  }

  async #settle(entry: PendingCreate): Promise<void> {
    if (entry.relink?.length) {
      entry = await this.#pushLinks(entry);
    }
    if (entry.state === "confirmed") {
      return;
    }
    if (entry.state === "needs-attention") {
      // The user asked to try again after a refusal: a new write, at the same path.
      await this.#resubmit(fresh(entry, entry.attempt));
      return;
    }
    const tracking = this.#records.createTracking;
    if (tracking && (await this.#settleByReceipt(entry, tracking))) {
      return;
    }
    // No receipt, or it is `unknown` or `missing`: not a decision. Decide from the
    // records themselves.
    // A record missing from a replica that has not caught up (after a reload, or after
    // sign-out cleared this device) may just not have arrived yet.
    if (tracking && !tracking.caughtUp()) {
      return;
    }
    const path = entry.candidates[entry.attempt];
    if (path === undefined) {
      await this.#attention(entry, "names-taken", exhaustedMessage);
      return;
    }
    const here = await this.#recordAt(path, entry);
    if (here?.ours) {
      if (here.confirmed) {
        await this.#confirmed(entry);
      }
      // Ours and still pending here: the replica is still sending it.
      return;
    }
    if (await recordPathById(this.#records, entry.recordId)) {
      // Confirmed, and renamed since.
      await this.#confirmed(entry);
      return;
    }
    // Nothing carries its `id`, and no refusal of this write is known. Send the same
    // write again under its own intent: if the log took it before, it lands once.
    await this.#resubmit(entry);
  }

  /** Settle `entry` from its receipt; false when the receipt does not decide it. */
  async #settleByReceipt(entry: PendingCreate, tracking: ReaderCreateTracking): Promise<boolean> {
    if (entry.mutationId === undefined) {
      return false;
    }
    const receipt = await tracking.receipt(entry.mutationId);
    switch (receipt.state) {
      case "pending":
        await this.#follow(entry, tracking);
        return true;
      case "confirmed":
        await this.#confirmed(entry);
        return true;
      case "rejected":
        // Reader deals with it here, so the SDK's ledger need not keep showing it refused.
        await tracking.acknowledge(entry.mutationId).catch(() => undefined);
        await this.#refused(entry, receipt.problem);
        return true;
      default:
        return false;
    }
  }

  /**
   * A pending create's record as the user has it now. Gone from the local view while
   * its create is pending means the user deleted it on this device; otherwise its
   * content is what a create written again after a refusal has to carry.
   */
  async #follow(entry: PendingCreate, tracking: ReaderCreateTracking): Promise<void> {
    if (entry.replicaId === undefined) {
      return;
    }
    const local = await tracking.local(entry.replicaId);
    if (!local) {
      this.#forgotten.add(entry.key);
      await this.#remove(entry);
      return;
    }
    const input: PendingCreate["input"] = {
      ...entry.input,
      frontmatter: relinked(local.frontmatter, entry.relink),
      ...(local.body === undefined ? {} : { body: local.body }),
    };
    if (JSON.stringify(input) !== JSON.stringify(entry.input)) {
      await this.#update(entry, { input });
    }
  }

  async #refused(entry: PendingCreate, problem: ReaderConnectProblem): Promise<void> {
    if (isIdExists(problem)) {
      // This create landed before (the record may have been deleted since): never again.
      await this.#confirmed(entry);
      return;
    }
    if (!isPathTaken(problem)) {
      await this.#attention(entry, "refused", problem.message);
      return;
    }
    const path = entry.candidates[entry.attempt];
    const holder = path === undefined ? null : await this.#recordAt(path, entry);
    if (holder?.ours) {
      // An earlier write of this same create holds the path: nothing to move.
      if (holder.confirmed) {
        await this.#confirmed(entry);
      } else {
        await this.#update(entry, { state: "pending", mutationId: undefined });
      }
      return;
    }
    if (entry.attempt + 1 >= entry.candidates.length) {
      await this.#attention(entry, "names-taken", exhaustedMessage);
      return;
    }
    await this.#resubmit(await this.#move(entry, entry.attempt + 1));
  }

  async #resubmit(entry: PendingCreate): Promise<void> {
    const submitted = await this.#submit(entry, {}, {});
    if (submitted.kind !== "refused") {
      return;
    }
    if (transient(submitted.outcome.problem)) {
      // Not a decision: keep it as it was and try again on the next trigger.
      return;
    }
    await this.#attention(
      submitted.entry,
      submitted.exhausted ? "names-taken" : "refused",
      submitted.exhausted ? exhaustedMessage : submitted.outcome.problem.message,
    );
  }

  /** Write `start` at its current candidate, moving on while candidates are taken. */
  async #submit(
    start: PendingCreate,
    how: Pick<FollowedCreate, "readBack" | "isOurs">,
    options: ReaderRequestOptions,
  ): Promise<Submitted> {
    // Which write this is comes from `start`; its content comes from the journal, where
    // the reconciler may have moved its links since `start` was read.
    let entry = await this.#update(start, {
      ...NEW_WRITE,
      attempt: start.attempt,
      submission: start.submission,
      // The same intent names the same record; a new intent gets a new one.
      replicaId: start.replicaId ?? uuidv7(),
    });
    for (;;) {
      const path = entry.candidates[entry.attempt];
      if (path === undefined) {
        throw new Error("A record create has no path to try.");
      }
      if (this.#forgotten.has(entry.key)) {
        // Deleted or discarded while this write waited its turn: never send it.
        return { kind: "settled", outcome: connectFailure(forgottenProblem) };
      }
      const { created, receipt } = await this.#send(entry, path);
      if (created.ok) {
        // No receipt means a client whose creates are decided before they return.
        if (receipt?.state === "pending") {
          await this.#update(entry, {
            state: "pending",
            mutationId: receipt.mutationId,
            replicaId: receipt.record ?? entry.replicaId,
          });
          return { kind: "waiting", outcome: created };
        }
        await this.#confirmed(entry);
        return { kind: "settled", outcome: created };
      }
      const failed = await this.#failed(entry, path, created, how, options);
      if (failed) {
        return failed;
      }
      entry = await this.#move(entry, entry.attempt + 1);
    }
  }

  async #send(
    entry: PendingCreate,
    path: string,
  ): Promise<{
    readonly created: ConnectOutcome<RecordDocument>;
    readonly receipt: ReaderCreateReceipt | undefined;
  }> {
    let receipt: ReaderCreateReceipt | undefined;
    const created = await this.#records.create(
      {
        path,
        ...(entry.input.type === undefined ? {} : { type: entry.input.type }),
        frontmatter: entry.input.frontmatter,
        ...(entry.input.body === undefined ? {} : { body: entry.input.body }),
        includeDocument: true,
      },
      {
        intent: intentFor(entry),
        ...(entry.replicaId === undefined ? {} : { replicaId: entry.replicaId }),
        onReceipt: (value) => {
          receipt = value;
        },
      },
    );
    return { created, receipt };
  }

  /** What a failed create means, or null when its path is taken and another remains. */
  async #failed(
    entry: PendingCreate,
    path: string,
    created: Extract<ConnectOutcome<RecordDocument>, { readonly ok: false }>,
    how: Pick<FollowedCreate, "readBack" | "isOurs">,
    options: ReaderRequestOptions,
  ): Promise<Submitted | null> {
    const problem = created.problem as ReaderConnectProblem;
    if (problem.code === "operation_outcome_unknown") {
      // Possibly captured: never write it again elsewhere until its receipt is known.
      await this.#update(entry, { state: "pending", mutationId: requestId(problem) });
      return { kind: "waiting", outcome: created };
    }
    const existing = await this.#readBack(path, how, options);
    if (existing && (how.isOurs ?? ((document) => idOf(document) === entry.recordId))(existing)) {
      // This create, or an earlier attempt of it, already holds the path.
      await this.#update(entry, { state: "pending" });
      return { kind: "waiting", outcome: connectSuccess(existing) };
    }
    if (isIdExists(problem)) {
      // This create landed before, and is not at this path any more: never write it again.
      await this.#confirmed(entry);
      return { kind: "settled", outcome: created };
    }
    if (transient(problem)) {
      return { kind: "refused", outcome: created, entry, exhausted: false };
    }
    // Native clients name a taken path. The legacy client does not, so there any
    // failure that is not ours moves on to the next name, as it always has.
    const taken = problem.native ? isPathTaken(problem) : true;
    if (taken && entry.attempt + 1 < entry.candidates.length) {
      return null;
    }
    return {
      kind: "refused",
      outcome: created,
      entry,
      exhausted: problem.native ? taken : existing !== null,
    };
  }

  async #readBack(
    path: string,
    how: Pick<FollowedCreate, "readBack">,
    options: ReaderRequestOptions,
  ): Promise<RecordDocument | null> {
    const read = await this.#records.read(
      { path, ...(how.readBack ?? { includeDocument: true }) },
      ...(options.signal ? [{ signal: options.signal }] : []),
    );
    return read.ok ? read.value : null;
  }

  async #recordAt(
    path: string,
    entry: PendingCreate,
  ): Promise<{ readonly ours: boolean; readonly confirmed: boolean } | null> {
    const tracking = this.#records.createTracking;
    if (tracking) {
      const record = await tracking.recordAt(path);
      return record ? { ours: record.id === entry.recordId, confirmed: record.confirmed } : null;
    }
    // Without tracking, a create that returned was decided by the server.
    const read = await this.#records.read({ path });
    return read.ok ? { ours: idOf(read.value) === entry.recordId, confirmed: true } : null;
  }

  /** Move to another candidate under a new intent, and point records that link here at it. */
  async #move(entry: PendingCreate, attempt: number): Promise<PendingCreate> {
    const from = entry.candidates[entry.attempt];
    const to = entry.candidates[attempt];
    const moved = await this.#update(entry, {
      ...NEW_WRITE,
      attempt,
      submission: entry.submission + 1,
      replicaId: uuidv7(),
    });
    if (from !== undefined && to !== undefined && from !== to) {
      this.#moves.set(stem(from), stem(to));
      await this.#relink(entry, { from: stem(from), to: stem(to) });
    }
    return moved;
  }

  async #relink(parent: PendingCreate, move: PendingRelink): Promise<void> {
    const journal = this.#journal;
    if (!journal) {
      return;
    }
    for (const dependent of await journal.list(parent.collectionId)) {
      if (!dependent.dependsOn?.includes(parent.key)) {
        continue;
      }
      const frontmatter = relinked(dependent.input.frontmatter, [move]);
      if (JSON.stringify(frontmatter) === JSON.stringify(dependent.input.frontmatter)) {
        continue;
      }
      // A dependent being written right now may already be captured with the old link,
      // so the move is always kept for the record too; a write still to come uses the
      // new link from the journal.
      const updated = await this.#update(dependent, {
        input: { ...dependent.input, frontmatter },
        relink: [...(dependent.relink ?? []), move],
      });
      if (!this.#active.has(updated.key)) {
        await this.#pushLinks(updated).catch(() => undefined);
      }
    }
  }

  /**
   * Write moved links to a dependent record that exists. Only the link text changes:
   * the patch is made from the record's current fields, so later edits are kept.
   */
  async #pushLinks(entry: PendingCreate): Promise<PendingCreate> {
    const moves = entry.relink ?? [];
    if (moves.length === 0) {
      return entry;
    }
    let current: { readonly path: string; readonly frontmatter: Record<string, unknown> } | null;
    try {
      current = await this.#current(entry);
    } catch {
      return this.#relinkFailed(entry);
    }
    if (!current) {
      // Not written yet (its write will carry the new links), or deleted since.
      return entry.state === "submitting"
        ? this.#relinkFailed(entry)
        : this.#update(entry, { relink: undefined, relinkTries: undefined });
    }
    const fields = current.frontmatter;
    const patch = Object.fromEntries(
      Object.keys(fields).flatMap((field) => {
        const value = relinked({ [field]: fields[field] }, moves)[field];
        return JSON.stringify(value) === JSON.stringify(fields[field]) ? [] : [[field, value]];
      }),
    );
    if (Object.keys(patch).length > 0) {
      const result = await this.#records.update({ path: current.path, patch }).catch(() => null);
      if (!result?.ok) {
        return this.#relinkFailed(entry);
      }
    }
    return this.#update(entry, { relink: undefined, relinkTries: undefined });
  }

  /** Count a failed link push; after a few, the moved links are let go. */
  #relinkFailed(entry: PendingCreate): Promise<PendingCreate> {
    const tries = (entry.relinkTries ?? 0) + 1;
    return this.#update(
      entry,
      tries >= MAX_RELINK_TRIES
        ? { relink: undefined, relinkTries: undefined }
        : { relinkTries: tries },
    );
  }

  /** A record's current path and fields as written, or null when it is not there. */
  async #current(
    entry: PendingCreate,
  ): Promise<{ readonly path: string; readonly frontmatter: Record<string, unknown> } | null> {
    const tracking = this.#records.createTracking;
    if (tracking && entry.replicaId !== undefined) {
      const local = await tracking.local(entry.replicaId);
      return local ? { path: local.path, frontmatter: { ...local.frontmatter } } : null;
    }
    const path = entry.candidates[entry.attempt];
    if (path === undefined) {
      return null;
    }
    const read = await this.#records.read({ path });
    return read.ok && idOf(read.value) === entry.recordId
      ? { path: read.value.path, frontmatter: { ...read.value.frontmatter } }
      : null;
  }

  async #confirmed(entry: PendingCreate): Promise<void> {
    if (!this.#journal) {
      return;
    }
    if (await this.#unsettled(entry)) {
      await this.#update(entry, {
        state: "confirmed",
        mutationId: undefined,
        problem: undefined,
        attention: undefined,
      });
      return;
    }
    await this.#remove(entry);
  }

  /** Whether a record this one links to is still in the journal and not confirmed. */
  async #unsettled(entry: PendingCreate): Promise<boolean> {
    const journal = this.#journal;
    if (!journal || !entry.dependsOn?.length) {
      return false;
    }
    for (const key of entry.dependsOn) {
      const parent = await journal.get(entry.collectionId, key);
      if (parent && parent.state !== "confirmed") {
        return true;
      }
    }
    return false;
  }

  /** Drop confirmed entries whose parents have settled. */
  async #sweep(collectionId: string): Promise<void> {
    const journal = this.#journal;
    if (!journal) {
      return;
    }
    for (const entry of await journal.list(collectionId)) {
      if (
        entry.state === "confirmed" &&
        !entry.relink?.length &&
        !this.#active.has(entry.key) &&
        !(await this.#unsettled(entry))
      ) {
        await this.#remove(entry);
      }
    }
  }

  async #attention(
    entry: PendingCreate,
    reason: PendingCreateAttention,
    problem: string,
  ): Promise<void> {
    await this.#update(entry, {
      state: "needs-attention",
      mutationId: undefined,
      replicaId: undefined,
      attention: reason,
      problem,
    });
  }

  async #parentsOf(
    collectionId: string,
    key: string,
    frontmatter: Readonly<Record<string, unknown>>,
  ): Promise<string[]> {
    const journal = this.#journal;
    if (!journal) {
      return [];
    }
    const targets = linkTargets(frontmatter);
    if (targets.size === 0) {
      return [];
    }
    let entries: readonly PendingCreate[];
    try {
      entries = await journal.list(collectionId);
    } catch {
      return [];
    }
    return entries
      .filter((entry) => {
        const path = entry.candidates[entry.attempt];
        return (
          entry.key !== key &&
          entry.kind !== "annotation" &&
          entry.state !== "confirmed" &&
          path !== undefined &&
          targets.has(stem(path))
        );
      })
      .map((entry) => entry.key);
  }

  #followMoves(frontmatter: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    let current = frontmatter;
    for (const [from, to] of this.#moves) {
      current = rewriteLinks(current, from, to) as Readonly<Record<string, unknown>>;
    }
    return current;
  }

  /**
   * Apply `change` to the entry as the journal has it now, so a change made meanwhile
   * (a moved link written by the reconciler) is kept, and write it back. A create let
   * go of is not written again.
   */
  async #update(entry: PendingCreate, change: EntryChange): Promise<PendingCreate> {
    let latest = entry;
    try {
      latest = (await this.#journal?.get(entry.collectionId, entry.key)) ?? entry;
    } catch {
      // Unreadable: build on the copy this caller has.
    }
    const next = Object.fromEntries(
      Object.entries({ ...latest, ...change }).filter(([, value]) => value !== undefined),
    ) as unknown as PendingCreate;
    if (!this.#forgotten.has(entry.key)) {
      await this.#put(next);
    }
    return next;
  }

  /** Keep `entry`. A journal that cannot be written never stops the create itself. */
  async #put(entry: PendingCreate): Promise<void> {
    try {
      await this.#journal?.put(entry);
    } catch {
      // Storage full, say (a large captured body). The create goes ahead untracked.
    }
  }

  async #remove(entry: PendingCreate): Promise<void> {
    try {
      await this.#journal?.remove(entry.collectionId, entry.key);
    } catch {
      // Left for the next pass.
    }
  }

  async #refresh(): Promise<void> {
    const journal = this.#journal;
    const collectionId = this.#collectionId;
    if (!journal || collectionId === null) {
      return;
    }
    let entries: readonly PendingCreate[];
    try {
      entries = await journal.list(collectionId);
    } catch {
      return;
    }
    const attention = entries
      .filter((entry) => entry.state === "needs-attention")
      .map((entry) => ({
        key: entry.key,
        kind: entry.kind,
        label: entry.label,
        reason: entry.attention ?? "refused",
        problem: entry.problem ?? "The collection did not accept it.",
      }));
    const waiting = entries.filter(
      (entry) => entry.state === "pending" || entry.state === "submitting",
    ).length;
    const previous = this.#snapshot;
    if (
      previous.waiting === waiting &&
      JSON.stringify(previous.attention) === JSON.stringify(attention)
    ) {
      return;
    }
    this.#snapshot = waiting === 0 && attention.length === 0 ? EMPTY : { waiting, attention };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

const forgottenProblem = connectProblem(
  "operation_cancelled",
  "This item was removed before it was saved.",
);

const exhaustedMessage =
  "Another record in the collection already uses each name Reader tried for it.";

function intentFor(entry: PendingCreate): string {
  return entry.submission === 0 ? entry.key : `${entry.key}:${String(entry.submission)}`;
}

/** The same create as a new write at `attempt`, under a new intent. */
function fresh(entry: PendingCreate, attempt: number): PendingCreate {
  return {
    ...entry,
    attempt,
    submission: entry.submission + 1,
    state: "submitting",
    replicaId: uuidv7(),
  };
}

/** `frontmatter` with every moved link pointed at its new place. */
function relinked(
  frontmatter: Readonly<Record<string, unknown>>,
  moves: readonly PendingRelink[] | undefined,
): Record<string, unknown> {
  let current: Record<string, unknown> = { ...frontmatter };
  for (const { from, to } of moves ?? []) {
    current = rewriteLinks(current, from, to) as Record<string, unknown>;
  }
  return current;
}

function transient(problem: ReaderConnectProblem): boolean {
  return problem.native
    ? TRANSIENT_NATIVE.has(problem.native.code)
    : TRANSIENT_CONNECT.has(problem.code);
}

function requestId(problem: ReaderConnectProblem): string | undefined {
  const details = (problem as { readonly details?: unknown }).details;
  const id =
    typeof details === "object" && details !== null
      ? (details as Record<string, unknown>)["request_id"]
      : undefined;
  return typeof id === "string" ? id : undefined;
}

function idOf(document: RecordDocument): unknown {
  return document.effectiveFrontmatter["id"];
}

function stem(path: string): string {
  return path.trim().replace(/\.md$/u, "");
}

const WIKILINK = /\[\[([^\]|#]+)(?=[\]|#])/gu;

/** The record stems that `[[…]]` links anywhere in `value` point at. */
export function linkTargets(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    for (const match of value.matchAll(WIKILINK)) {
      into.add(stem(match[1] ?? ""));
    }
  } else if (Array.isArray(value)) {
    value.forEach((item) => linkTargets(item, into));
  } else if (typeof value === "object" && value !== null) {
    Object.values(value).forEach((item) => linkTargets(item, into));
  }
  return into;
}

/** `value` with every `[[from…]]` link pointed at `to`; alias and anchor are kept. */
export function rewriteLinks(value: unknown, from: string, to: string): unknown {
  if (typeof value === "string") {
    return value.replace(WIKILINK, (link, target: string) =>
      stem(target) === from ? `[[${to}` : link,
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteLinks(item, from, to));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rewriteLinks(item, from, to)]),
    );
  }
  return value;
}

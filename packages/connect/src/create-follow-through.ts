import { isMdbaseError, uuidv7 } from "@mdbase-dev/sdk";

import { recordPathById, requireSaved, updateRecord } from "./repository-client.js";
import { isIdExists, isPathTaken } from "./validation-issues.js";

import type {
  ContractSelector,
  MdbaseClient,
  Problem,
  RecordView,
  Settlement,
  JsonObject,
} from "@mdbase-dev/sdk";
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
  readonly readBack?: { readonly contract?: ContractSelector };
  /** Whether a record read back is an earlier attempt of this create (default: same `id`). */
  readonly isOurs?: (document: RecordView) => boolean;
  /**
   * Reader `id`s of the records this create links to. A link to one of them made from a
   * stale copy of its path is pointed at where it moved. Links to anything else are
   * never rewritten, even when their text names a path some create moved away from.
   */
  readonly linksTo?: readonly string[];
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

interface Submitted {
  readonly settlement: Settlement;
  readonly existing?: RecordView;
  readonly entry: PendingCreate;
  readonly exhausted: boolean;
}

/** Changes to an entry. `undefined` removes a field. */
type EntryChange = { -readonly [Key in keyof PendingCreate]?: PendingCreate[Key] | undefined };

const EMPTY: CreateFollowThroughSnapshot = { waiting: 0, attention: [] };

/** How often a moved link may fail to reach a dependent record before it is let go. */
const MAX_RELINK_TRIES = 5;

/** Native codes that mean "not now" rather than "no" (`replica-client-api.md` §9). */
const TRANSIENT_NATIVE = new Set(["unavailable", "rate_limited", "cancelled", "unauthenticated"]);
/** The fields that make a new write: a new intent, with nothing known about it yet. */
const NEW_WRITE: EntryChange = {
  state: "submitting",
  mutationId: undefined,
  replicaId: undefined,
  problem: undefined,
  attention: undefined,
};

export class CreateFollowThrough implements ReaderCreateFollowThrough {
  readonly #records: MdbaseClient;
  readonly #journal: CreateJournal | null;
  readonly #collectionId: string | null;
  readonly #now: () => string;
  /** Creates this instance is writing right now; the reconciler leaves them alone. */
  readonly #active = new Set<string>();
  /** Creates let go of (deleted or discarded); a write still in flight never brings them back. */
  readonly #forgotten = new Set<string>();
  /**
   * Records seen at one path and moved to another after the log refused them, for links
   * made from a stale copy of the old path. Only creates that link to `recordId` follow them.
   */
  readonly #moves: { readonly from: string; readonly to: string; readonly recordId: string }[] = [];
  readonly #listeners = new Set<() => void>();
  #snapshot: CreateFollowThroughSnapshot = EMPTY;
  #running: Promise<void> | null = null;
  #again = false;
  #retry = false;

  constructor(
    records: MdbaseClient,
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
  async create(request: FollowedCreate, options: ReaderRequestOptions = {}): Promise<RecordView> {
    this.#active.add(request.key);
    this.#forgotten.delete(request.key);
    try {
      const frontmatter = this.#followMoves(request.input.frontmatter, request.linksTo ?? []);
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
      // Nobody has seen this record at any path yet.
      const submitted = await this.#submit(entry, request, options, false);
      if (submitted.existing) {
        return submitted.existing;
      }
      if (submitted.settlement.outcome === "rejected") {
        await this.#remove(submitted.entry);
      }
      requireSaved(submitted.settlement);
      if (!submitted.settlement.record) {
        throw new Error("The created record no longer exists.");
      }
      return submitted.settlement.record;
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
    if (await this.#settleByReceipt(entry)) {
      return;
    }
    // No receipt, or it is `unknown` or `missing`: not a decision. Decide from the
    // records themselves.
    // A record missing from a replica that has not caught up (after a reload, or after
    // sign-out cleared this device) may just not have arrived yet.
    if (!this.#caughtUp()) {
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

  /** Settle the original mutation, never infer success from a missing receipt. */
  async #settleByReceipt(entry: PendingCreate): Promise<boolean> {
    if (entry.mutationId === undefined) {
      return false;
    }
    let receipt;
    try {
      receipt = await this.#records.receipt(entry.mutationId);
    } catch (error) {
      if (isMdbaseError(error, "not_found")) {
        return false;
      }
      throw error;
    }
    switch (receipt.state) {
      case "pending":
        await this.#follow(entry);
        return true;
      case "confirmed":
        await this.#confirmed(entry);
        return true;
      case "rejected":
        await this.#records.ledger.acknowledge(entry.mutationId);
        await this.#refused(
          entry,
          receipt.problem ?? {
            code: "internal",
            recovery: "contact_support",
            message: "The create was rejected without a reason.",
          },
        );
        return true;
      default:
        return false;
    }
  }

  #caughtUp(): boolean {
    const { status, ledger } = this.#records;
    return ledger.getSnapshot().restored && status.confirmedThrough >= status.headKnown;
  }

  /**
   * A pending create's record as the user has it now. Gone from the local view while
   * its create is pending means the user deleted it on this device; otherwise its
   * content is what a create written again after a refusal has to carry.
   */
  async #follow(entry: PendingCreate): Promise<void> {
    if (entry.replicaId === undefined) {
      return;
    }
    const local = await this.#records.find(entry.replicaId, { include: { body: true } });
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

  async #refused(entry: PendingCreate, problem: Problem): Promise<void> {
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
    await this.#resubmit(await this.#move(entry, entry.attempt + 1, true));
  }

  async #resubmit(entry: PendingCreate): Promise<void> {
    // The record was saved at its path before the log refused it, so links may name it.
    const submitted = await this.#submit(entry, {}, {}, true);
    if (submitted.existing || submitted.settlement.outcome !== "rejected") {
      return;
    }
    const { problem } = submitted.settlement;
    if (transient(problem)) {
      return;
    }
    await this.#attention(
      submitted.entry,
      submitted.exhausted ? "names-taken" : "refused",
      submitted.exhausted ? exhaustedMessage : problem.message,
    );
  }

  /**
   * Write `start` at its current candidate, moving on while candidates are taken. `seen`
   * says whether anyone may already link to the record at its current path: true after
   * the log refused a saved record, false for a create whose caller has no path yet.
   */
  async #submit(
    start: PendingCreate,
    how: Pick<FollowedCreate, "readBack" | "isOurs">,
    options: ReaderRequestOptions,
    seen: boolean,
  ): Promise<Submitted> {
    let entry = await this.#update(start, {
      ...NEW_WRITE,
      attempt: start.attempt,
      submission: start.submission,
      replicaId: start.replicaId ?? uuidv7(),
    });
    for (;;) {
      const path = entry.candidates[entry.attempt];
      if (path === undefined) {
        throw new Error("A record create has no path to try.");
      }
      if (this.#forgotten.has(entry.key)) {
        return {
          settlement: { outcome: "rejected", problem: forgottenProblem },
          entry,
          exhausted: false,
        };
      }
      const settlement = await this.#send(entry, path, options);
      if (settlement.outcome !== "rejected") {
        await this.#submitted(entry, settlement);
        return { settlement, entry, exhausted: false };
      }
      const existing = await this.#readBack(path, how, options);
      if (existing && (how.isOurs ?? ((record) => idOf(record) === entry.recordId))(existing)) {
        await this.#update(entry, { state: "pending" });
        return { settlement, existing, entry, exhausted: false };
      }
      if (existing && idOf(existing) === entry.recordId) {
        return { settlement, entry, exhausted: false };
      }
      const taken = isPathTaken(settlement.problem);
      if (taken && entry.attempt + 1 < entry.candidates.length) {
        entry = await this.#move(entry, entry.attempt + 1, seen);
        continue;
      }
      if (isIdExists(settlement.problem)) {
        await this.#confirmed(entry);
      }
      return { settlement, entry, exhausted: taken };
    }
  }

  async #submitted(
    entry: PendingCreate,
    settlement: Exclude<Settlement, { outcome: "rejected" }>,
  ): Promise<void> {
    if (settlement.outcome === "confirmed") {
      await this.#confirmed(entry);
    } else if (settlement.outcome === "saved_on_device" || settlement.outcome === "unknown") {
      await this.#update(entry, { state: "pending", mutationId: settlement.mutationId });
    }
  }

  async #send(
    entry: PendingCreate,
    path: string,
    options: ReaderRequestOptions,
  ): Promise<Settlement> {
    const { signal } = options;
    return this.#records.settle(
      this.#records.create(
        {
          path,
          ...(entry.replicaId ? { id: entry.replicaId } : {}),
          ...entry.input,
          frontmatter: entry.input.frontmatter as JsonObject,
        },
        { intent: intentFor(entry), ...(signal ? { signal } : {}) },
      ),
      {
        read: {
          record: entry.replicaId ?? { path },
          include: { effective: true, body: true, document: true },
        },
        ...(signal ? { signal } : {}),
      },
    );
  }

  async #readBack(
    path: string,
    how: Pick<FollowedCreate, "readBack">,
    options: ReaderRequestOptions,
  ): Promise<RecordView | null> {
    const { signal } = options;
    return this.#records.find(
      { path },
      { include: { effective: true, body: true, document: true }, ...(signal ? { signal } : {}) },
    );
  }

  async #recordAt(
    path: string,
    entry: PendingCreate,
  ): Promise<{ readonly ours: boolean; readonly confirmed: boolean } | null> {
    const record = await this.#records.find({ path }, { include: { effective: true } });
    return record
      ? {
          ours: idOf(record) === entry.recordId,
          confirmed: record.state.state === "confirmed" || record.state.confirmedSeq > 0,
        }
      : null;
  }

  /**
   * Move to another candidate under a new intent. With `relink`, the record may have been
   * seen at its old path, so point records that link to it there at the new one.
   */
  async #move(entry: PendingCreate, attempt: number, relink: boolean): Promise<PendingCreate> {
    const from = entry.candidates[entry.attempt];
    const to = entry.candidates[attempt];
    const moved = await this.#update(entry, {
      ...NEW_WRITE,
      attempt,
      submission: entry.submission + 1,
      replicaId: uuidv7(),
    });
    if (relink && from !== undefined && to !== undefined && from !== to) {
      this.#moves.push({ from: stem(from), to: stem(to), recordId: entry.recordId });
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
      const result = await updateRecord(
        this.#records,
        { path: current.path },
        { patch: patch as JsonObject },
      ).catch(() => null);
      if (!result) {
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
    const record = entry.replicaId
      ? await this.#records.find(entry.replicaId, { include: { body: true } })
      : null;
    return record ? { path: record.path, frontmatter: { ...record.frontmatter } } : null;
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

  #followMoves(
    frontmatter: Readonly<Record<string, unknown>>,
    linksTo: readonly string[],
  ): Readonly<Record<string, unknown>> {
    let current = frontmatter;
    for (const { from, to, recordId } of this.#moves) {
      if (linksTo.includes(recordId)) {
        current = rewriteLinks(current, from, to) as Readonly<Record<string, unknown>>;
      }
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

const forgottenProblem: Problem = {
  code: "cancelled",
  recovery: "none",
  message: "This item was removed before it was saved.",
};

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

function transient(problem: Problem): boolean {
  return TRANSIENT_NATIVE.has(problem.code);
}

function idOf(document: RecordView): unknown {
  return (document.effective ?? document.frontmatter)["id"];
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

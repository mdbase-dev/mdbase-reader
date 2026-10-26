import { i18n } from "@lingui/core";
import { t as translate, msg } from "@lingui/core/macro";
import {
  MdbaseRecordSession,
  recordChanged,
  recordFailure,
  recordMissing,
  recordOutcome,
  recordSuccess,
  type JsonObject,
  type MdbaseRecordSessionState,
  type ReaderConnectedCollection,
} from "@mdbase-reader/connect";

import { loadNoteDraft, saveNoteDraft, type NoteDraft } from "./drafts.js";

import type { Source } from "@mdbase-reader/core";

/** The source fields edited beside the note, as the session compares them. */
export interface SourceDetails {
  readonly title: string;
  readonly tags: readonly string[];
}

export interface SourceNoteSnapshot {
  readonly state: MdbaseRecordSessionState;
  readonly body: string;
  /** The title and tags with this panel's unsaved edits. */
  readonly details: SourceDetails;
  /** The collection's copy this note was last saved against. */
  readonly source: Source;
  /** The collection's newer note, while `state` is `conflict`. */
  readonly remote: Source | null;
  readonly problem: string | null;
  /** Unsaved text from an earlier panel was brought back. Cleared by the next edit. */
  readonly restored: boolean;
  /** The browser could not keep a copy of unsaved text. */
  readonly localProblem: string | null;
}

export interface NoteDraftStore {
  load(collectionId: string, sourceId: string): Promise<NoteDraft | null>;
  save(collectionId: string, sourceId: string, draft: NoteDraft | null): Promise<void>;
}

const browserSession: NoteDraftStore = { load: loadNoteDraft, save: saveNoteDraft };
const localProblem = msg`Your browser could not keep a copy of this note. Keep the panel open until it is saved.`;
/** Typing is copied to browser storage after this pause, so closing the panel loses little. */
const storeDelayMs = 250;

type NoteCollection = Pick<ReaderConnectedCollection, "collectionId" | "sources" | "bodyRecovery">;

/**
 * A saved source's literature note, edited in the panel. The SDK record session owns
 * autosave, revision checks, conflicts and exact recovery; this adds the copy in
 * `chrome.storage.session` that survives closing the panel.
 */
export class SourceNoteSession {
  readonly #record: MdbaseRecordSession<Source>;
  readonly #listeners = new Set<() => void>();
  readonly #collectionId: string;
  readonly #sourceId: string;
  readonly #pending: (requestId: string) => boolean;
  #restored = false;
  #localProblem: string | null = null;
  #storeTimer: ReturnType<typeof setTimeout> | undefined;
  /** Whether browser storage may still hold a copy that needs removing. */
  #stored = false;
  #snapshot: SourceNoteSnapshot;

  constructor(
    base: Source,
    collection: NoteCollection,
    private readonly store: NoteDraftStore = browserSession,
    /** Each newer copy of the source this session saves or reads, for the rest of the panel. */
    private readonly publish: (source: Source) => void = () => undefined,
  ) {
    this.#collectionId = collection.collectionId;
    this.#sourceId = base.id;
    const { collectionId, sources, bodyRecovery } = collection;
    this.#pending = (requestId) => bodyRecovery.pending(requestId);
    this.#record = new MdbaseRecordSession<Source>(
      base,
      {
        revision: (source) => source.recordRevision,
        body: (source) => source.body,
        // Only these fields are compared, so an edit elsewhere to any other is never a conflict.
        frontmatter: (source) => ({ title: source.title, tags: [...source.tags] }),
        write: async (expected, change) => {
          try {
            let target = expected;
            if (change.patch) {
              // Field updates take no revision, so check first that nothing moved on. A change
              // made between this read and the write is overwritten for these two fields only.
              const current = await sources.get(collectionId, expected.id);
              if (!current) {
                return recordMissing();
              }
              if (current.recordRevision !== expected.recordRevision) {
                return recordChanged(translate({ message: "The source changed before saving." }));
              }
              if (!sources.updateFields) {
                throw new Error(
                  translate({
                    message: "This collection can’t edit a source’s title and tags here.",
                  }),
                );
              }
              target = await sources.updateFields({
                collectionId,
                sourceId: expected.id,
                fields: change.patch,
              });
              if (change.body === undefined) {
                return recordSuccess(target);
              }
            }
            return recordSuccess(
              await sources.updateBody({
                collectionId,
                sourceId: target.id,
                expectedRevision: target.recordRevision,
                body: change.body ?? target.body,
              }),
            );
          } catch (error) {
            return recordFailure(error);
          }
        },
        read: (current) => recordOutcome(() => sources.get(collectionId, current.id)),
        recover: (requestId) =>
          recordOutcome(() => bodyRecovery.recoverSource({ collectionId, requestId })),
        isPending: this.#pending,
      },
      { autosave: { idleMs: 1000 } },
    );
    this.#snapshot = this.#project();
    this.#record.subscribe(() => this.#sync());
  }

  /** Brings back text left unsaved by an earlier panel, and resumes an interrupted write. */
  async start(): Promise<void> {
    let draft: NoteDraft | null;
    try {
      draft = await this.store.load(this.#collectionId, this.#sourceId);
    } catch {
      this.#update({ localProblem: i18n._(localProblem) });
      return;
    }
    // Typing that began while the copy loaded is newer than the copy.
    if (!draft || this.#record.snapshot.dirty) {
      return;
    }
    this.#stored = true;
    // An earlier panel's write whose outcome is unknown settles before anything new is sent.
    if (draft.requestId && this.#pending(draft.requestId)) {
      this.#record.resumeRecovery(draft.requestId);
    }
    if (draft.body === this.#record.snapshot.record.body && !draft.patch) {
      this.#clearStored();
      return;
    }
    this.#restored = true;
    this.#record.restore({
      body: draft.body,
      baseBody: draft.baseBody,
      ...(draft.patch ? { patch: draft.patch } : {}),
      ...(draft.baseFrontmatter ? { baseFrontmatter: draft.baseFrontmatter } : {}),
    });
    // A restored draft that conflicts waits for a decision; otherwise it saves itself.
    if (this.#record.snapshot.state === "unsaved") {
      this.#record.autosave();
    }
  }

  getSnapshot = (): SourceNoteSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  edit(body: string): void {
    if (body === this.#snapshot.body) {
      return;
    }
    this.#restored = false;
    this.#record.setBody(body);
  }

  /** A changed title or tags, autosaved with the note. An empty title is not saved. */
  editDetails(details: Partial<SourceDetails>): void {
    const current = this.#snapshot.details;
    const patch = detailsPatch(current, {
      title: details.title?.trim() ? details.title : current.title,
      tags: details.tags ?? current.tags,
    });
    if (patch) {
      this.#restored = false;
      this.#record.patchFrontmatter(patch);
    }
  }

  /** Saves now instead of after the autosave pause. */
  save(): void {
    void this.#record.save();
  }

  /** Reads the collection's copy, as when the panel is shown again after a while. */
  refresh(): void {
    if (this.#snapshot.state !== "saving" && this.#snapshot.state !== "recovery") {
      void this.#record.refresh();
    }
  }

  /** Keep this panel's text on top of the newer note, or take the newer note. */
  resolve(keep: "mine" | "theirs"): void {
    this.#restored = false;
    this.#record.resolve({ keep });
    if (keep === "mine") {
      void this.#record.save();
    }
  }

  /** Writes the browser copy at once, for when the panel is about to close. */
  keepCopy(): void {
    if (this.#storeTimer !== undefined) {
      clearTimeout(this.#storeTimer);
      this.#storeTimer = undefined;
      this.#store();
    }
  }

  #sync(): void {
    const next = this.#project();
    if (!this.#record.snapshot.dirty && next.state === "saved") {
      this.#clearStored();
    } else if (
      next.body !== this.#snapshot.body ||
      next.details !== this.#snapshot.details ||
      next.state !== this.#snapshot.state
    ) {
      this.#scheduleStore();
    }
    const published = next.source !== this.#snapshot.source;
    this.#snapshot = next;
    this.#emit();
    if (published) {
      this.publish(next.source);
    }
  }

  #project(): SourceNoteSnapshot {
    const record = this.#record.snapshot;
    const previous = this.#snapshot as SourceNoteSnapshot | undefined;
    const details = sourceDetails(record.frontmatter);
    return {
      state: record.state,
      body: record.body,
      // The same object while unchanged, so views comparing it redraw only on a change.
      details:
        previous?.details.title === details.title && sameTags(previous.details.tags, details.tags)
          ? previous.details
          : details,
      source: record.record,
      remote: record.remote,
      problem:
        record.state === "deleted"
          ? translate`This source is no longer in the collection. Your text is kept in this panel.`
          : (record.problem?.message ?? null),
      restored: this.#restored,
      localProblem: this.#localProblem,
    };
  }

  #scheduleStore(): void {
    if (this.#storeTimer !== undefined) {
      clearTimeout(this.#storeTimer);
    }
    this.#storeTimer = setTimeout(() => {
      this.#storeTimer = undefined;
      this.#store();
    }, storeDelayMs);
  }

  #store(): void {
    const record = this.#record.snapshot;
    if (!record.dirty) {
      return;
    }
    this.#stored = true;
    const base = { title: record.record.title, tags: [...record.record.tags] };
    const patch = detailsPatch(base, sourceDetails(record.frontmatter));
    const draft: NoteDraft = {
      body: record.body,
      baseBody: record.record.body,
      ...(patch ? { patch, baseFrontmatter: base } : {}),
      ...(record.pendingRequestId ? { requestId: record.pendingRequestId } : {}),
    };
    this.store.save(this.#collectionId, this.#sourceId, draft).then(
      () => this.#update({ localProblem: null }),
      () => this.#update({ localProblem: i18n._(localProblem) }),
    );
  }

  #clearStored(): void {
    if (this.#storeTimer !== undefined) {
      clearTimeout(this.#storeTimer);
      this.#storeTimer = undefined;
    }
    if (!this.#stored) {
      return;
    }
    this.#stored = false;
    // A stale copy is harmless: it matches the saved note and is discarded on restore.
    void this.store.save(this.#collectionId, this.#sourceId, null).catch(() => undefined);
  }

  #update(patch: Pick<SourceNoteSnapshot, "localProblem">): void {
    this.#localProblem = patch.localProblem;
    this.#snapshot = { ...this.#snapshot, ...patch };
    this.#emit();
  }

  #emit(): void {
    this.#listeners.forEach((listener) => listener());
  }
}

function sourceDetails(frontmatter: JsonObject): SourceDetails {
  const { title, tags } = frontmatter;
  return {
    title: typeof title === "string" ? title : "",
    tags: Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string") : [],
  };
}

/** The fields of `to` that differ from `from`, or null when none do. */
function detailsPatch(from: SourceDetails, to: SourceDetails): JsonObject | null {
  const patch: JsonObject = {};
  if (to.title !== from.title) {
    patch["title"] = to.title;
  }
  if (!sameTags(to.tags, from.tags)) {
    patch["tags"] = [...to.tags];
  }
  return Object.keys(patch).length ? patch : null;
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

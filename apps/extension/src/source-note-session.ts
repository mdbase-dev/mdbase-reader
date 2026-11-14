import { i18n } from "@lingui/core";
import { t as translate, msg } from "@lingui/core/macro";
import {
  openReaderRecord,
  sourceFromDocument,
  type Mdbase,
  type JsonObject,
  type RecordLease,
  type RecordSession,
  type RecordSessionState,
  type RecordSessionSnapshot,
} from "@mdbase-reader/connect";
import { describeError } from "@mdbase-reader/connect/native";

import { loadNoteDraft, saveNoteDraft, type NoteDraft } from "./drafts.js";

import type { Source } from "@mdbase-reader/core";

/** The source fields edited beside the note, as the session compares them. */
export interface SourceDetails {
  readonly title: string;
  readonly tags: readonly string[];
}

export interface SourceNoteSnapshot {
  readonly state: RecordSessionState;
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

/**
 * A saved source's literature note, edited in the panel. The SDK record session owns
 * autosave, revision checks, conflicts and exact recovery; this adds the copy in
 * `chrome.storage.session` that survives closing the panel.
 */
export class SourceNoteSession {
  private record: RecordSession | null = null;
  private lease: RecordLease | null = null;
  private base: Source;
  private restoredRemote: Source | null = null;
  readonly #listeners = new Set<() => void>();
  readonly #collectionId: string;
  readonly #sourceId: string;
  #restored = false;
  #localProblem: string | null = null;
  #storeTimer: ReturnType<typeof setTimeout> | undefined;
  /** Whether browser storage may still hold a copy that needs removing. */
  #stored = false;
  #snapshot: SourceNoteSnapshot;

  constructor(
    private readonly mdbase: Mdbase,
    base: Source,
    private readonly store: NoteDraftStore = browserSession,
    private readonly publish: (source: Source) => void = () => undefined,
  ) {
    this.base = base;
    this.#collectionId = base.collectionId;
    this.#sourceId = base.id;
    this.#snapshot = {
      state: "saved",
      body: base.body,
      details: { title: base.title, tags: base.tags },
      source: base,
      remote: null,
      problem: null,
      restored: false,
      localProblem: null,
    };
  }

  async start(): Promise<void> {
    if (this.lease) {
      return;
    }
    try {
      const draft = await this.store.load(this.#collectionId, this.#sourceId);
      const lease = await openReaderRecord(this.mdbase, this.base.collectionId, this.base.path, {
        autosave: { idleMs: 1000 },
        ...(draft?.recovery ? { recovery: draft.recovery } : {}),
      });
      if (
        draft?.requestId &&
        !draft.recovery &&
        lease.session.getSnapshot().recovery?.mutationId !== draft.requestId
      ) {
        lease.release();
        throw new Error(
          "This earlier edit needs its original recovery information. Your local text has been retained.",
        );
      }
      this.lease = lease;
      this.record = lease.session;
      this.base = sourceFromDocument(this.base.collectionId, this.record.getSnapshot().record);
      if (draft) {
        this.restoreDraft(draft, lease.session);
      }
      this.record.subscribe(() => this.#sync());
      if (this.restoredRemote) {
        this.#emit();
      } else {
        this.#sync();
      }
    } catch (error) {
      this.#snapshot = {
        ...this.#snapshot,
        state: "error",
        problem: describeError(error)?.message ?? translate`Reader could not open the source note.`,
      };
      this.#emit();
    }
  }

  private restoreDraft(draft: NoteDraft, record: RecordSession): void {
    this.#stored = true;
    if (draft.body !== this.base.body || draft.patch) {
      this.#restored = true;
      if (
        !draft.recovery &&
        (draft.baseBody !== this.base.body ||
          (draft.baseFrontmatter &&
            Object.entries(draft.baseFrontmatter).some(
              ([key, value]) =>
                JSON.stringify(record.getSnapshot().frontmatter[key]) !== JSON.stringify(value),
            )))
      ) {
        this.restoredRemote = this.base;
        this.#snapshot = {
          ...this.#snapshot,
          state: "conflict",
          body: draft.body,
          remote: this.base,
          restored: true,
          details: sourceDetails({
            title: this.base.title,
            tags: [...this.base.tags],
            ...draft.patch,
          }),
        };
      } else {
        record.setBody(draft.body);
        if (draft.patch) {
          record.patchFrontmatter(draft.patch);
        }
      }
    } else {
      this.#clearStored();
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
    if (this.restoredRemote) {
      this.#snapshot = { ...this.#snapshot, body };
      this.#emit();
    } else {
      this.record?.setBody(body);
    }
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
      if (this.restoredRemote) {
        this.#snapshot = {
          ...this.#snapshot,
          details: sourceDetails({
            ...this.#snapshot.details,
            tags: [...this.#snapshot.details.tags],
            ...patch,
          }),
        };
        this.#emit();
      } else {
        this.record?.patchFrontmatter(patch);
      }
    }
  }

  /** Saves now instead of after the autosave pause. */
  save(): void {
    void this.record?.flush();
  }

  /** Reads the collection's copy, as when the panel is shown again after a while. */
  refresh(): void {
    if (this.record && !this.restoredRemote) {
      this.#sync();
    }
  }

  resolve(keep: "mine" | "theirs"): void {
    if (!this.record) {
      return;
    }
    this.#restored = false;
    if (this.restoredRemote) {
      this.restoredRemote = null;
      if (keep === "mine") {
        this.record.setBody(this.#snapshot.body);
        this.record.patchFrontmatter({
          title: this.#snapshot.details.title,
          tags: [...this.#snapshot.details.tags],
        });
      }
    } else {
      this.record.resolve({ keep });
    }
    this.#sync();
    if (keep === "mine") {
      void this.record.flush();
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
    if (!this.record || this.restoredRemote) {
      return;
    }
    const next = this.#project(this.record.getSnapshot());
    if (!this.record.getSnapshot().dirty && next.state === "saved") {
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

  #project(record: RecordSessionSnapshot): SourceNoteSnapshot {
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
      source: sourceFromDocument(this.base.collectionId, record.record),
      remote: record.remote ? sourceFromDocument(this.base.collectionId, record.remote) : null,
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
    const record = this.record?.getSnapshot();
    if (!record) {
      return;
    }
    if (!record.dirty) {
      return;
    }
    this.#stored = true;
    const details = sourceDetails(record.record.frontmatter);
    const base = { title: details.title, tags: [...details.tags] };
    const patch = detailsPatch(base, sourceDetails(record.frontmatter));
    const draft: NoteDraft = {
      body: record.body,
      baseBody: record.record.body ?? "",
      ...(patch ? { patch, baseFrontmatter: base } : {}),
      ...(record.recovery
        ? {
            requestId: record.recovery.mutationId,
            recovery: {
              mutationId: record.recovery.mutationId,
              recordId: record.recovery.recordId,
              baseRevision: record.recovery.baseRevision,
            },
          }
        : {}),
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

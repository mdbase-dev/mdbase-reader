import { RecordSession, type RecordSessionSnapshot } from "@mdbase-reader/connect";

import { readerErrorMessage } from "./errors.js";
import { LocalDraftCheckpoint } from "./local-draft-checkpoint.js";
import { clearSourceDraft, readSourceDraft, writeSourceDraft } from "./source-draft-storage.js";
import { trackUnstoredSourceChanges } from "./unsaved-source-drafts.js";

import type { DraftStorage } from "./source-draft-storage.js";
import type { Source } from "@mdbase-reader/core";

export interface SourceDraftSnapshot {
  readonly body: string;
  readonly status: "saved" | "unsaved" | "saving" | "error";
  readonly error: string | null;
  readonly localProblem: string | null;
  readonly locallySaved: boolean;
  readonly recovered: boolean;
  readonly conflict: Source | null;
  readonly savedSource?: Source;
}

const missing = "This source no longer exists. Your local draft has been retained.";

/**
 * One writer per source per gateway, shared by inspector and workbench editors.
 * The SDK record session owns writing and classification; Reader owns its
 * device checkpoint and publication to the shared source resource.
 */
export class SourceDraftSession {
  private snapshot: SourceDraftSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly record: RecordSession<Source>;
  private storedBody: string | undefined;
  private acknowledged: Source;
  private resumed = false;
  private readonly checkpoint = new LocalDraftCheckpoint(() => this.store());

  constructor(
    base: Source,
    private readonly storage: DraftStorage,
    persist: (source: Source, body: string) => Promise<Source>,
    refresh: () => Promise<Source | null>,
    private readonly publish: (source: Source) => void,
  ) {
    this.acknowledged = base;
    this.record = new RecordSession<Source>(
      base,
      {
        revision: (source) => source.recordRevision,
        body: (source) => source.body,
        // Refresh before writing: no silent overwrite of edits made in another application.
        write: async (expected, change) => {
          const current = await refresh();
          if (!current) {
            throw new Error(missing);
          }
          if (current.recordRevision !== expected.recordRevision) {
            throw new Error("The source note changed before saving.");
          }
          const body = change.body ?? current.body;
          const saved = await persist(current, body);
          this.saved(saved, body);
          return saved;
        },
        read: refresh,
      },
      { autosave: { idleMs: 1000 } },
    );
    this.snapshot = {
      body: base.body,
      status: "saved",
      error: null,
      localProblem: null,
      locallySaved: false,
      recovered: false,
      conflict: null,
    };
    try {
      const draft = readSourceDraft(storage, base);
      this.storedBody = draft?.body;
      if (draft && draft.body !== base.body) {
        this.record.restore(draft);
        this.snapshot = { ...this.snapshot, locallySaved: true, recovered: true };
        // The first mounted subscriber resumes safe recovery; conflicts still require a decision.
      } else if (draft) {
        clearSourceDraft(storage, base, base.body);
      }
    } catch {
      this.snapshot = {
        ...this.snapshot,
        localProblem:
          "Local draft storage is unavailable or unreadable. Keep this tab open until the note is saved to the collection.",
      };
    }
    this.snapshot = this.project(this.snapshot);
    this.record.subscribe(() => this.sync());
  }

  getSnapshot = (): SourceDraftSnapshot => this.snapshot;
  getText = (): string => this.snapshot.body;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.snapshot.recovered && !this.snapshot.conflict && !this.resumed) {
      this.resumed = true;
      this.record.autosave();
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.checkpoint.flush();
      }
    };
  };

  edit = (body: string): void => {
    if (body === this.snapshot.body) {
      return;
    }
    this.snapshot = { ...this.snapshot, recovered: false, locallySaved: false };
    this.record.setBody(body);
    this.checkpoint.schedule();
  };

  /** Records published by other views or refreshes; the session classifies them. */
  receive(source: Source): void {
    this.record.receive(source);
  }

  save = (): Promise<void> => {
    this.checkpoint.flush();
    this.snapshot = { ...this.snapshot, recovered: false };
    return this.record.save().catch(() => undefined);
  };

  async flush(): Promise<Source> {
    this.checkpoint.flush();
    try {
      return await this.record.flush();
    } catch {
      throw new Error(this.snapshot.error ?? "Resolve the source note conflict before continuing.");
    }
  }

  resolve = (choice: "local" | "remote"): void => {
    const remote = this.snapshot.conflict;
    if (!remote || this.snapshot.status === "saving") {
      return;
    }
    if (choice === "remote") {
      this.checkpoint.cancel();
      try {
        clearSourceDraft(this.storage, remote, this.storedBody ?? this.snapshot.body);
        this.storedBody = undefined;
      } catch {
        /* Retain on failure. */
      }
      this.snapshot = {
        ...this.snapshot,
        recovered: false,
        locallySaved: false,
        savedSource: remote,
      };
      this.record.resolve({ keep: "theirs" });
      this.publish(remote);
    } else {
      this.snapshot = { ...this.snapshot, recovered: false };
      this.record.resolve({ keep: "mine" });
      this.store();
      void this.save();
    }
  };

  /** Our own acknowledgement: publish it and retire the device copy it supersedes. */
  private saved(saved: Source, body: string): void {
    this.publish(saved);
    this.snapshot = { ...this.snapshot, savedSource: saved };
    try {
      clearSourceDraft(this.storage, saved, body);
      if (this.storedBody === body) {
        this.storedBody = undefined;
      }
    } catch {
      // A stale recovery copy is safer than discarding unsaved work.
    }
  }

  private sync(): void {
    const previous = this.snapshot;
    const next = this.project(previous);
    const acknowledged = this.record.snapshot.record !== this.acknowledged;
    this.acknowledged = this.record.snapshot.record;
    if (next.status === "saved" && previous.status !== "saved") {
      this.checkpoint.cancel();
      this.update({ ...next, locallySaved: false });
      return;
    }
    this.update(next);
    // Typing during a write: keep the newer text on the device until it is committed.
    if (acknowledged && next.status === "unsaved" && !next.conflict) {
      this.store();
    }
  }

  private project(current: SourceDraftSnapshot): SourceDraftSnapshot {
    const record: RecordSessionSnapshot<Source> = this.record.snapshot;
    const status: SourceDraftSnapshot["status"] =
      record.state === "saved"
        ? "saved"
        : record.state === "saving"
          ? "saving"
          : record.state === "unsaved" || record.state === "conflict"
            ? "unsaved"
            : "error";
    return {
      ...current,
      body: record.body,
      status,
      conflict: record.remote,
      error:
        record.state === "deleted"
          ? missing
          : status === "error"
            ? readerErrorMessage(
                record.error,
                "Reader could not save this note. Your draft is retained.",
              )
            : null,
    };
  }

  private store(): void {
    this.checkpoint.cancel();
    try {
      writeSourceDraft(this.storage, this.record.snapshot.record, this.snapshot.body);
      this.storedBody = this.snapshot.body;
      this.update({ locallySaved: true, localProblem: null });
    } catch {
      this.update({
        locallySaved: false,
        localProblem:
          "This draft could not be saved locally. Keep this tab open and retry saving to the collection.",
      });
    }
  }

  private update(patch: Partial<SourceDraftSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    trackUnstoredSourceChanges(
      this,
      this.snapshot.status !== "saved" && !this.snapshot.locallySaved,
    );
    this.listeners.forEach((listener) => listener());
  }
}

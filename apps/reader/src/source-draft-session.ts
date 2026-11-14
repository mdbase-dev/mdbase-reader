import { t } from "@lingui/core/macro";
import {
  openReaderRecord,
  sourceFromDocument,
  type Mdbase,
  type RecordLease,
  type RecordRecoveryRef,
} from "@mdbase-reader/connect";
import { describeError } from "@mdbase-reader/connect/native";

import { LocalDraftCheckpoint } from "./local-draft-checkpoint.js";
import { recordEditStatus } from "./record-edit-status.js";
import {
  clearSourceDraft,
  readSourceDraft,
  writeSourceDraft,
  type DraftStorage,
} from "./source-draft-storage.js";
import { trackUnstoredSourceChanges } from "./unsaved-source-drafts.js";

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

/** Reader keeps its existing device checkpoint; all writing and observation use a native lease. */
export class SourceDraftSession {
  private snapshot: SourceDraftSnapshot;
  private readonly listeners = new Set<() => void>();
  private lease: RecordLease | null = null;
  private opened: Promise<void> | null = null;
  private stopLease: (() => void) | undefined;
  private detached = false;
  private storedBody: string | undefined;
  private restoredBaseBody: string | undefined;
  private recovery: RecordRecoveryRef | undefined;
  private restoredConflict: Source | null = null;
  private current: Source;
  private readonly checkpoint = new LocalDraftCheckpoint(() => this.store());

  constructor(
    private readonly mdbase: Mdbase,
    base: Source,
    private readonly storage: DraftStorage,
    private readonly publish: (source: Source) => void,
  ) {
    this.current = base;
    this.snapshot = {
      body: base.body,
      status: "saved",
      error: null,
      locallySaved: false,
      localProblem: null,
      recovered: false,
      conflict: null,
    };
    try {
      const draft = readSourceDraft(storage, base);
      this.storedBody = draft?.body;
      this.recovery = draft?.recovery;
      if (draft && draft.body !== base.body) {
        this.restoredBaseBody = draft.baseBody;
        this.snapshot = {
          ...this.snapshot,
          body: draft.body,
          status: "unsaved",
          locallySaved: true,
          recovered: true,
        };
      } else if (draft) {
        clearSourceDraft(storage, base, base.body);
      }
    } catch {
      this.snapshot = {
        ...this.snapshot,
        localProblem: t`Local draft storage is unavailable or unreadable. Keep this tab open until the note is saved to the collection.`,
      };
    }
    this.open();
  }

  private open(): void {
    if (this.opened) {
      return;
    }
    const base = this.current;
    const recovery = this.recovery;
    this.opened = openReaderRecord(this.mdbase, base.collectionId, base.path, {
      autosave: { idleMs: 1000 },
      ...(recovery ? { recovery } : {}),
    })
      .then((lease) => {
        this.lease = lease;
        this.recovery = undefined;
        const record = lease.session.getSnapshot();
        const local = this.snapshot.body;
        const changed = local !== base.body || this.snapshot.recovered;
        this.current = sourceFromDocument(base.collectionId, record.record);
        if (
          !recovery &&
          changed &&
          (this.restoredBaseBody ?? base.body) !== this.current.body &&
          local !== this.current.body
        ) {
          this.restoredConflict = this.current;
          this.update({ conflict: this.current, status: "unsaved" });
        } else if (changed) {
          lease.session.setBody(local);
        }
        this.stopLease = lease.session.subscribe(() => this.sync());
        this.sync();
      })
      .catch((error: unknown) =>
        this.update({
          status: "error",
          error:
            describeError(error)?.message ??
            t`Reader could not save this note. Your draft is retained.`,
        }),
      );
  }

  getSnapshot = (): SourceDraftSnapshot => this.snapshot;
  getText = (): string => this.snapshot.body;
  subscribe = (listener: () => void): (() => void) => {
    this.detached = false;
    this.listeners.add(listener);
    this.open();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.detached = true;
        this.checkpoint.flush();
        this.releaseSaved();
      }
    };
  };
  edit = (body: string): void => {
    if (body === this.snapshot.body) {
      return;
    }
    this.update({ body, status: "unsaved", recovered: false, locallySaved: false });
    if (!this.restoredConflict) {
      this.lease?.session.setBody(body);
    }
    this.checkpoint.schedule();
  };
  // The native lease observes remote changes by UUID; a domain refresh never replaces its witness.
  save = async (): Promise<void> => {
    this.open();
    this.checkpoint.flush();
    await this.opened;
    if (!this.lease || this.restoredConflict) {
      return;
    }
    await this.lease.session.flush();
    this.sync();
  };
  async flush(): Promise<Source> {
    await this.save();
    if (!this.lease || this.restoredConflict || this.snapshot.status !== "saved") {
      throw new Error(
        this.snapshot.error ?? t`Resolve the source note conflict before continuing.`,
      );
    }
    return this.current;
  }
  resolve = (choice: "local" | "remote"): void => {
    if (!this.lease || !this.snapshot.conflict || this.snapshot.status === "saving") {
      return;
    }
    const checkpointBody = this.storedBody ?? this.snapshot.body;
    if (this.restoredConflict) {
      this.restoredConflict = null;
      this.lease.session.setBody(choice === "local" ? this.snapshot.body : this.current.body);
    } else {
      this.lease.session.resolve({ keep: choice === "local" ? "mine" : "theirs" });
    }
    if (choice === "remote") {
      this.checkpoint.cancel();
      try {
        clearSourceDraft(this.storage, this.current, checkpointBody);
        this.storedBody = undefined;
      } catch {
        /* Retain the checkpoint on failure. */
      }
      this.update({ recovered: false, locallySaved: false, conflict: null });
    } else {
      this.store();
      void this.save();
    }
    this.sync();
  };
  private sync(): void {
    if (!this.lease || this.restoredConflict) {
      return;
    }
    const record = this.lease.session.getSnapshot();
    const source = sourceFromDocument(this.current.collectionId, record.record);
    const status = recordEditStatus(record.state);
    const acknowledged = source.recordRevision !== this.current.recordRevision;
    this.current = source;
    if (record.state === "saved") {
      this.checkpoint.cancel();
      try {
        clearSourceDraft(this.storage, source, record.body);
        this.storedBody = undefined;
      } catch {
        /* Keep an older checkpoint if storage is unavailable. */
      }
    }
    this.update({
      body: record.body,
      status,
      conflict: record.remote ? sourceFromDocument(source.collectionId, record.remote) : null,
      error:
        record.state === "deleted"
          ? t`This source no longer exists. Your local draft has been retained.`
          : status === "error"
            ? (describeError(record.problem)?.message ??
              t`Reader could not save this note. Your draft is retained.`)
            : null,
      ...(record.state === "saved" ? { locallySaved: false, recovered: false } : {}),
      ...(acknowledged ? { savedSource: source } : {}),
    });
    if (acknowledged) {
      this.publish(source);
    }
    if (record.recovery) {
      this.store();
    }
    this.releaseSaved();
  }
  private releaseSaved(): void {
    const record = this.lease?.session.getSnapshot();
    if (!this.detached || record?.state !== "saved" || record.dirty || record.recovery) {
      return;
    }
    this.stopLease?.();
    this.stopLease = undefined;
    this.lease?.release();
    this.lease = null;
    this.opened = null;
  }
  private store(): void {
    this.checkpoint.cancel();
    try {
      writeSourceDraft(
        this.storage,
        this.current,
        this.snapshot.body,
        this.lease?.session.getSnapshot().recovery ?? undefined,
      );
      this.storedBody = this.snapshot.body;
      this.update({ locallySaved: true, localProblem: null });
    } catch {
      this.update({
        locallySaved: false,
        localProblem: t`This draft could not be saved locally. Keep this tab open and retry saving to the collection.`,
      });
    }
  }
  private update(value: Partial<SourceDraftSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...value };
    trackUnstoredSourceChanges(
      this,
      this.snapshot.status !== "saved" && !this.snapshot.locallySaved,
    );
    this.listeners.forEach((listener) => listener());
  }
}

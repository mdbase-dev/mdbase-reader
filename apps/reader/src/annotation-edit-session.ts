import { t } from "@lingui/core/macro";
import {
  annotationFromDocument,
  openReaderRecord,
  type Mdbase,
  type RecordLease,
  type RecordSessionSnapshot,
  type RecordSessionState,
} from "@mdbase-reader/connect";
import { describeError } from "@mdbase-reader/connect/native";

import {
  clearAnnotationDraftIfCurrent,
  flushAnnotationDraft,
  saveAnnotationDraft,
  type AnnotationLocalDraft,
} from "./annotation-drafts.js";
import { clearLegacyEdits, readLegacyEdits } from "./annotation-edit-recovery.js";
import { recordEditStatus } from "./record-edit-status.js";
import { trackAnnotationEdits } from "./unsaved-annotation-edits.js";

import type { AnnotationEditSnapshot } from "./annotation-edit-types.js";
import type { Annotation } from "@mdbase-reader/core";

export type { AnnotationEditSnapshot, PersistAnnotation } from "./annotation-edit-types.js";

/** Reader owns editor focus and deletion UI; the SDK lease owns the native draft and writer. */
export class AnnotationEditSession {
  readonly key: string;
  private snapshot: AnnotationEditSnapshot = {
    status: "loading",
    problem: null,
    conflict: null,
    locked: false,
    editing: false,
    textVersion: 0,
  };
  private lease: RecordLease | null = null;
  private opened: Promise<void> | null = null;
  private stopLease: (() => void) | undefined;
  private detached = false;
  private current: Annotation;
  private text: string;
  private readonly listeners = new Set<() => void>();
  private legacy = false;
  private deviceDraft: AnnotationLocalDraft | null = null;
  private restoredConflict: Annotation | null = null;
  private removed = false;
  private lockOwner: object | undefined;
  private editorOwner: object | undefined;
  constructor(
    private readonly mdbase: Mdbase,
    base: Annotation,
    private readonly publish: (annotation: Annotation) => void = () => undefined,
  ) {
    this.key = JSON.stringify([base.collectionId, base.sourceId, base.id]);
    this.current = base;
    this.text = base.body;
  }
  start(): void {
    if (this.opened) {
      return;
    }
    this.update({ status: "loading" });
    const base = this.current;
    this.opened = (async () => {
      if (!base.path) {
        throw new Error("An annotation path is required for editing.");
      }
      const [lease, draft] = await Promise.all([
        openReaderRecord(this.mdbase, base.collectionId, base.path, { autosave: { idleMs: 1000 } }),
        new Promise<AnnotationLocalDraft | null>((ready) => readLegacyEdits(this.key, ready)),
      ]);
      this.lease = lease;
      const record = lease.session.getSnapshot();
      this.current = annotationFromDocument(base.collectionId, record.record, base.sourceId);
      this.deviceDraft = draft?.savedOnDevice ? draft : null;
      this.legacy = draft !== null && !this.deviceDraft;
      if (draft && draft.body !== this.current.body) {
        this.text = draft.body;
        if (draft.savedOnDevice || draft.baseBody !== this.current.body) {
          this.restoredConflict = this.current;
        } else {
          lease.session.setBody(draft.body);
        }
      }
      this.stopLease = lease.session.subscribe(() => this.sync());
      this.sync(true);
    })().catch((error: unknown) =>
      this.update({
        status: "error",
        problem: describeError(error)?.message ?? t`Could not save. Keep Reader open and retry.`,
      }),
    );
  }
  getSnapshot = (): AnnotationEditSnapshot => this.snapshot;
  getText = (): string => this.text;
  getAnnotation = (): Annotation => this.current;
  subscribe = (listener: () => void): (() => void) => {
    this.detached = false;
    this.listeners.add(listener);
    this.start();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.detached = true;
        if (this.deviceDraft) {
          flushAnnotationDraft(this.key);
        }
        this.releaseSaved();
      }
    };
  };
  ownsEditor = (owner: object): boolean => this.editorOwner === owner;
  claimEditor(owner: object, transfer = false): boolean {
    if (this.snapshot.locked || (this.editorOwner && this.editorOwner !== owner && !transfer)) {
      return false;
    }
    if (this.editorOwner === owner) {
      return true;
    }
    this.editorOwner = owner;
    this.update({ editing: true, textVersion: this.snapshot.textVersion + 1 });
    return true;
  }
  releaseEditor(owner: object): void {
    if (this.ownsEditor(owner)) {
      this.editorOwner = undefined;
      this.update({ editing: false });
    }
  }
  edit = (body: string): void => {
    if (this.snapshot.locked || !this.lease || body === this.text) {
      return;
    }
    this.text = body;
    if (this.deviceDraft) {
      this.checkpointDeviceDraft(body);
    }
    if (!this.restoredConflict) {
      this.lease.session.setBody(body);
      this.lease.session.patchFrontmatter({ modified_at: new Date().toISOString() });
    }
    this.update({ status: "unsaved" });
  };
  save = async (): Promise<void> => {
    if (this.snapshot.locked) {
      return;
    }
    await this.opened;
    if (!this.lease || this.restoredConflict) {
      return;
    }
    if (this.deviceDraft) {
      flushAnnotationDraft(this.key);
    }
    await this.lease.session.flush();
    this.sync();
  };
  resolve = (choice: "local" | "remote"): void => {
    if (
      !this.lease ||
      !this.snapshot.conflict ||
      this.snapshot.status === "saving" ||
      this.snapshot.locked
    ) {
      return;
    }
    if (this.restoredConflict) {
      this.restoredConflict = null;
      if (choice === "remote") {
        this.clearDeviceDraft();
      }
      this.lease.session.setBody(choice === "local" ? this.text : this.current.body);
    } else {
      this.lease.session.resolve({ keep: choice === "local" ? "mine" : "theirs" });
    }
    this.sync();
  };
  discard = (): void => {
    if (!this.lease || this.snapshot.status === "saving" || this.snapshot.locked) {
      return;
    }
    if (this.restoredConflict) {
      this.restoredConflict = null;
      this.clearDeviceDraft();
    }
    if (this.lease.session.getSnapshot().remote) {
      this.lease.session.resolve({ keep: "theirs" });
    }
    const base = this.lease.session.getSnapshot().record;
    this.lease.session.setBody(base.body ?? "");
    this.lease.session.patchFrontmatter({ modified_at: base.frontmatter["modified_at"] });
    this.sync();
  };
  /** Disable edits first, then flush the SDK writer before a deletion preview begins. */
  lock = async (owner: object = this): Promise<boolean> => {
    if (this.lockOwner || !this.lease || this.restoredConflict) {
      return false;
    }
    this.lockOwner = owner;
    this.update({ locked: true });
    const result = await this.lease.session.flush();
    this.sync();
    if (!result.ok) {
      this.unlock(owner);
      return false;
    }
    return true;
  };
  unlock = (owner: object = this): void => {
    if (this.lockOwner === owner) {
      this.lockOwner = undefined;
      this.update({ locked: false });
    }
  };
  deleted = (): void => {
    this.removed = true;
    this.stopLease?.();
    this.lease?.release();
    this.update({ status: "saved", locked: true });
  };
  private sync(loaded = false): void {
    if (!this.lease || this.removed) {
      return;
    }
    const record = this.lease.session.getSnapshot();
    const next = annotationFromDocument(
      this.current.collectionId,
      record.record,
      this.current.sourceId,
    );
    const published = next.recordRevision !== this.current.recordRevision;
    const previousText = this.text;
    this.reconcileDeviceDraft(record, next);
    this.current = next;
    const text = this.restoredConflict ? this.text : record.body;
    const changed = text !== previousText;
    this.text = text;
    this.clearRecoveredDraft(record.state);
    const status = this.restoredConflict ? "unsaved" : recordEditStatus(record.state);
    this.update({
      status,
      conflict:
        this.restoredConflict ??
        (record.remote
          ? annotationFromDocument(next.collectionId, record.remote, next.sourceId)
          : null),
      problem:
        status === "error"
          ? (describeError(record.problem)?.message ??
            t`Could not save. Keep Reader open and retry.`)
          : null,
      ...(changed || loaded ? { textVersion: this.snapshot.textVersion + 1 } : {}),
    });
    if (published) {
      this.publish(next);
    }
    this.releaseSaved();
  }
  private reconcileDeviceDraft(record: RecordSessionSnapshot, next: Annotation): void {
    if (
      record.state === "saved_on_device" &&
      this.snapshot.status === "saving" &&
      record.body !== this.current.body
    ) {
      this.checkpointDeviceDraft(record.body);
      flushAnnotationDraft(this.key);
    }
    if (record.state !== "saved" || !this.deviceDraft) {
      return;
    }
    if (record.body === this.deviceDraft.body) {
      this.restoredConflict = null;
      this.clearDeviceDraft();
    } else {
      this.text = this.deviceDraft.body;
      this.restoredConflict = next;
    }
  }
  private checkpointDeviceDraft(body: string): void {
    const draft = {
      body,
      baseBody: this.deviceDraft?.baseBody ?? this.current.body,
      savedOnDevice: true,
    };
    this.deviceDraft = draft;
    this.legacy = false;
    saveAnnotationDraft(this.key, draft);
  }
  private clearDeviceDraft(): void {
    const draft = this.deviceDraft;
    this.deviceDraft = null;
    if (draft) {
      void clearAnnotationDraftIfCurrent(this.key, draft).catch(() => {
        // A retained checkpoint is safe to review on the next open.
      });
    }
  }
  private clearRecoveredDraft(state: RecordSessionState): void {
    if (state === "saved" && this.legacy && !this.restoredConflict) {
      clearLegacyEdits(this.key);
      this.legacy = false;
    }
  }

  private releaseSaved(): void {
    const record = this.lease?.session.getSnapshot();
    if (
      !this.detached ||
      this.restoredConflict ||
      record?.state !== "saved" ||
      record.dirty ||
      record.recovery
    ) {
      return;
    }
    this.stopLease?.();
    this.stopLease = undefined;
    this.lease?.release();
    this.lease = null;
    this.opened = null;
  }
  private update(value: Partial<AnnotationEditSnapshot>): void {
    trackAnnotationEdits(
      this,
      this.current,
      !this.removed &&
        (this.text !== this.current.body ||
          Boolean(this.restoredConflict) ||
          Boolean(this.lease?.session.getSnapshot().dirty)),
    );
    if (
      Object.keys(value).every(
        (key) =>
          this.snapshot[key as keyof AnnotationEditSnapshot] ===
          value[key as keyof AnnotationEditSnapshot],
      )
    ) {
      return;
    }
    this.snapshot = { ...this.snapshot, ...value };
    this.listeners.forEach((listener) => listener());
  }
}

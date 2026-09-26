import {
  MdbaseRecordSession,
  recordFailure,
  recordOutcome,
  recordSuccess,
  type MdbaseRecordSessionState,
} from "@mdbase-reader/connect";

import { clearLegacyEdits, readLegacyEdits } from "./annotation-edit-recovery.js";
import { readerErrorMessage } from "./errors.js";
import { trackAnnotationEdits } from "./unsaved-annotation-edits.js";

import type { AnnotationEditSnapshot, PersistAnnotation } from "./annotation-edit-types.js";
import type { Annotation } from "@mdbase-reader/core";

export type { AnnotationEditSnapshot, PersistAnnotation } from "./annotation-edit-types.js";

/** Exact recovery of an interrupted write, where the gateway offers it. */
export interface AnnotationRecovery {
  recover(requestId: string): Promise<Annotation>;
  isPending(requestId: string): boolean;
}

/**
 * Reader's single-owner editor lease and deletion lock around the SDK record
 * session, which owns the writer, acknowledgements and conflict classification.
 */
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
  private readonly record: MdbaseRecordSession<Annotation>;
  private text: string;
  private listeners = new Set<() => void>();
  private started = false;
  private legacy = false;
  private removed = false;
  private lockOwner: object | undefined;
  private releaseLock: (() => void) | undefined;
  private editorOwner: object | undefined;
  constructor(
    base: Annotation,
    persist: PersistAnnotation,
    refresh?: (annotation: Annotation) => Promise<Annotation | null>,
    recovery?: AnnotationRecovery,
  ) {
    this.key = JSON.stringify([base.collectionId, base.sourceId, base.id]);
    this.text = base.body;
    this.record = new MdbaseRecordSession<Annotation>(
      base,
      {
        revision: (annotation) => annotation.recordRevision ?? "",
        body: (annotation) => annotation.body,
        write: async (expected, change) => {
          try {
            return recordSuccess(await persist(expected, change.body ?? expected.body));
          } catch (error) {
            return recordFailure(error);
          }
        },
        ...(refresh
          ? { read: (annotation: Annotation) => recordOutcome(() => refresh(annotation)) }
          : {}),
        ...(recovery
          ? {
              recover: (requestId: string) => recordOutcome(() => recovery.recover(requestId)),
              isPending: (requestId: string) => recovery.isPending(requestId),
            }
          : {}),
      },
      { autosave: { idleMs: 1000 } },
    );
    this.record.subscribe(() => this.sync());
  }
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    readLegacyEdits(this.key, (value) => {
      this.legacy = value !== null;
      if (value) {
        this.record.restore(value);
      }
      this.sync(true);
    });
  }
  getSnapshot = (): AnnotationEditSnapshot => this.snapshot;
  getText = (): string => this.text;
  getAnnotation = (): Annotation => this.record.snapshot.record;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
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
    if (!this.ownsEditor(owner)) {
      return;
    }
    this.editorOwner = undefined;
    this.update({ editing: false });
  }
  receive(annotation: Annotation): void {
    this.record.receive(annotation);
  }
  edit = (body: string): void => {
    if (this.snapshot.locked || this.snapshot.status === "loading" || body === this.text) {
      return;
    }
    this.text = body;
    this.record.setBody(body);
  };
  save = (): Promise<void> => {
    if (this.snapshot.locked || this.snapshot.status === "loading") {
      return Promise.resolve();
    }
    return this.record.save().then(() => undefined);
  };
  resolve = (choice: "local" | "remote"): void => {
    if (!this.snapshot.conflict || this.snapshot.status === "saving" || this.snapshot.locked) {
      return;
    }
    this.record.resolve({ keep: choice === "local" ? "mine" : "theirs" });
  };
  discard = (): void => {
    if (this.snapshot.status === "saving" || this.snapshot.locked) {
      return;
    }
    this.record.discard();
  };
  /** Holds the record's write queue, so no autosave can start during a deletion check. */
  lock = async (owner: object = this): Promise<boolean> => {
    if (this.lockOwner) {
      return false;
    }
    this.lockOwner = owner;
    this.update({ locked: true });
    const held = new Promise<void>((release) => {
      this.releaseLock = release;
    });
    await new Promise<void>((drained) => {
      void this.record.run(() => {
        drained();
        return held;
      });
    });
    const { state } = this.record.snapshot;
    if (state === "error" || state === "conflict") {
      this.unlock(owner);
      return false;
    }
    return true;
  };
  unlock = (owner: object = this): void => {
    if (this.lockOwner !== owner) {
      return;
    }
    this.lockOwner = undefined;
    this.releaseLock?.();
    this.releaseLock = undefined;
    this.update({ locked: false });
  };
  deleted = (): void => {
    this.removed = true;
    this.record.discard();
    this.record.markDeleted();
    this.update({ locked: true });
  };
  private sync(loaded = false): void {
    if (!this.started) {
      return;
    }
    const record = this.record.snapshot;
    const clean = !record.dirty && !record.remote;
    // A clean session shows the committed text, including serializer normalization.
    const text = clean ? record.record.body : record.body;
    if (clean && this.legacy && !loaded && this.snapshot.status !== "saved") {
      clearLegacyEdits(this.key);
      this.legacy = false;
    }
    const status = this.removed ? "saved" : annotationStatus(record.state);
    const changed = text !== this.text;
    this.text = text;
    this.update({
      status,
      conflict: record.remote,
      problem:
        status === "error"
          ? readerErrorMessage(
              record.problem?.message,
              "Could not save. Keep Reader open and retry.",
            )
          : null,
      ...(changed || loaded ? { textVersion: this.snapshot.textVersion + 1 } : {}),
    });
  }
  private update(value: Partial<AnnotationEditSnapshot>): void {
    const next = { ...this.snapshot, ...value };
    const record = this.record.snapshot;
    trackAnnotationEdits(
      this,
      record.record,
      !this.removed && (record.dirty || Boolean(record.remote)),
    );
    const keys = Object.keys(value) as (keyof AnnotationEditSnapshot)[];
    if (keys.every((key) => this.snapshot[key] === value[key])) {
      return;
    }
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}

function annotationStatus(state: MdbaseRecordSessionState): AnnotationEditSnapshot["status"] {
  switch (state) {
    case "saved":
      return "saved";
    case "saving":
      return "saving";
    case "unsaved":
    case "conflict":
      return "unsaved";
    default:
      return "error";
  }
}

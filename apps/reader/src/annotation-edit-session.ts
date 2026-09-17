import {
  annotationDraftKey,
  annotationDraftSnapshot,
  flushAnnotationDraft,
  saveAnnotationDraft,
  stageAnnotationDraft,
  whenAnnotationDraftReady,
} from "./annotation-drafts.js";
import { readerErrorMessage } from "./errors.js";
import { LocalDraftCheckpoint } from "./local-draft-checkpoint.js";

import type { Annotation } from "@mdbase-reader/core";

export interface AnnotationEditSnapshot {
  readonly status: "loading" | "saved" | "unsaved" | "saving" | "error";
  readonly problem: string | null;
  readonly conflict: Annotation | null;
  readonly locked: boolean;
  readonly editing: boolean;
  readonly textVersion: number;
}
export type PersistAnnotation = (base: Annotation, body: string) => Promise<Annotation>;
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
  private body: string;
  private listeners = new Set<() => void>();
  private inFlight: Promise<void> | undefined;
  private started = false;
  private lockOwner: object | undefined;
  private editorOwner: object | undefined;
  private seen = new Set<string | undefined>();
  private readonly checkpoint = new LocalDraftCheckpoint(() => this.store());
  constructor(
    private base: Annotation,
    private readonly persist: PersistAnnotation,
    private readonly refresh?: (annotation: Annotation) => Promise<Annotation | null>,
  ) {
    this.key = annotationDraftKey(base.collectionId, base.sourceId, base.id);
    this.body = base.body;
    this.seen.add(base.recordRevision);
  }
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    whenAnnotationDraftReady(this.key, () => this.restore());
  }
  getSnapshot = (): AnnotationEditSnapshot => this.snapshot;
  getText = (): string => this.body;
  getAnnotation = (): Annotation => this.base;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  ownsEditor = (owner: object): boolean => this.editorOwner === owner;
  claimEditor(owner: object, transfer = false): boolean {
    if (
      this.snapshot.locked ||
      this.inFlight ||
      (this.editorOwner && this.editorOwner !== owner && !transfer)
    ) {
      return false;
    }
    if (this.editorOwner === owner) {
      return true;
    }
    this.checkpoint.flush();
    this.editorOwner = owner;
    this.update({ editing: true, textVersion: this.snapshot.textVersion + 1 });
    return true;
  }
  releaseEditor(owner: object): void {
    if (!this.ownsEditor(owner)) {
      return;
    }
    this.checkpoint.flush();
    this.editorOwner = undefined;
    this.update({ editing: false });
  }
  receive(annotation: Annotation): void {
    if (annotation.recordRevision && this.seen.has(annotation.recordRevision)) {
      return;
    }
    this.seen.add(annotation.recordRevision);
    if (this.snapshot.status === "loading") {
      this.base = annotation;
      return;
    }
    if (annotation.body === this.body) {
      this.base = annotation;
      this.clear();
      return;
    }
    const dirty = this.body !== this.base.body;
    if (dirty && annotation.body !== this.base.body) {
      this.update({ conflict: annotation });
      return;
    }
    this.base = annotation;
    if (!dirty) {
      this.clear();
    }
  }
  edit = (body: string): void => {
    if (
      this.snapshot.locked ||
      this.inFlight ||
      this.snapshot.status === "loading" ||
      body === this.body
    ) {
      return;
    }
    this.body = body;
    const pending = this.checkpoint.isPending();
    this.checkpoint.schedule();
    // Each new batch invalidates older in-flight checkpoints, without broadcasting keystrokes.
    if (!pending) {
      stageAnnotationDraft(this.key, { body, baseBody: this.base.body });
    }
    this.update({ status: "unsaved", problem: null });
  };
  save = (): Promise<void> => {
    this.checkpoint.flush();
    if (this.inFlight) {
      return this.inFlight;
    }
    if (this.snapshot.conflict || this.snapshot.locked || this.snapshot.status === "loading") {
      return Promise.resolve();
    }
    if (this.body === this.base.body) {
      this.clear();
      return Promise.resolve();
    }
    this.update({ status: "saving", problem: null });
    this.inFlight = this.write(this.base, this.body).finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  };
  resolve = (choice: "local" | "remote"): void => {
    const remote = this.snapshot.conflict;
    if (!remote || this.inFlight || this.snapshot.locked) {
      return;
    }
    this.base = remote;
    this.update({ conflict: null, problem: null });
    if (choice === "remote") {
      this.clear();
    } else {
      this.update({ status: "unsaved" });
      this.store();
    }
  };
  discard = (): void => {
    if (this.inFlight || this.snapshot.locked) {
      return;
    }
    this.base = this.snapshot.conflict ?? this.base;
    this.clear();
  };
  lock = async (owner: object = this): Promise<boolean> => {
    if (this.lockOwner) {
      return false;
    }
    this.lockOwner = owner;
    this.update({ locked: true });
    this.checkpoint.flush();
    await this.inFlight;
    if (this.snapshot.status === "error" || this.snapshot.conflict) {
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
    this.update({ locked: false });
  };
  deleted = (): void => {
    this.checkpoint.cancel();
    saveAnnotationDraft(this.key, null);
    this.update({ locked: true, status: "saved" });
  };
  private restore(): void {
    const value = annotationDraftSnapshot(this.key).value;
    this.body = value?.body ?? this.base.body;
    this.update({
      status: value ? "unsaved" : "saved",
      textVersion: this.snapshot.textVersion + 1,
      conflict:
        value && value.baseBody !== this.base.body && value.body !== this.base.body
          ? this.base
          : null,
    });
  }
  private async write(base: Annotation, body: string): Promise<void> {
    try {
      const saved = await this.persist(base, body);
      this.base = saved;
      this.seen.add(saved.recordRevision);
      if (!this.snapshot.conflict) {
        this.clear();
      } else {
        this.update({ status: "unsaved" });
        this.store();
      }
    } catch (reason) {
      const latest = await this.refresh?.(this.base).catch(() => null);
      if (latest) {
        this.receive(latest);
        if (latest.body === this.body && !this.snapshot.conflict) {
          this.clear();
          return;
        }
      }
      this.update({
        status: "error",
        problem: this.snapshot.conflict
          ? null
          : readerErrorMessage(
              reason,
              "Could not save changes to the collection. Your draft is retained.",
            ),
      });
    }
  }
  private clear(): void {
    this.checkpoint.cancel();
    this.body = this.base.body;
    saveAnnotationDraft(this.key, null);
    this.update({
      status: "saved",
      problem: null,
      conflict: null,
      textVersion: this.snapshot.textVersion + 1,
    });
  }
  private store(): void {
    this.checkpoint.cancel();
    saveAnnotationDraft(this.key, { body: this.body, baseBody: this.base.body });
    flushAnnotationDraft(this.key);
  }
  private update(value: Partial<AnnotationEditSnapshot>): void {
    const keys = Object.keys(value) as (keyof AnnotationEditSnapshot)[];
    if (keys.every((key) => this.snapshot[key] === value[key])) {
      return;
    }
    this.snapshot = { ...this.snapshot, ...value };
    this.listeners.forEach((listener) => listener());
  }
}

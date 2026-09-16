import {
  annotationDraftKey,
  annotationDraftSnapshot,
  loadAnnotationDraft,
  saveAnnotationDraft,
  subscribeAnnotationDrafts,
} from "./annotation-drafts.js";
import { readerErrorMessage } from "./errors.js";

import type { Annotation } from "@mdbase-reader/core";

export interface AnnotationEditSnapshot {
  readonly body: string;
  readonly status: "loading" | "saved" | "unsaved" | "saving" | "error";
  readonly problem: string | null;
  readonly conflict: Annotation | null;
  readonly locked: boolean;
}
export type PersistAnnotation = (base: Annotation, body: string) => Promise<Annotation>;
/** A single debounced, revision-checked writer independent of the number of editor views. */
export class AnnotationEditSession {
  readonly key: string;
  private snapshot: AnnotationEditSnapshot;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | undefined;
  private savingBody: string | undefined;
  private started = false;
  private lockOwner: object | undefined;
  private seen = new Set<string | undefined>();
  constructor(
    private base: Annotation,
    private readonly persist: PersistAnnotation,
    private readonly refresh?: (annotation: Annotation) => Promise<Annotation | null>,
  ) {
    this.key = annotationDraftKey(base.collectionId, base.sourceId, base.id);
    this.seen.add(base.recordRevision);
    this.snapshot = {
      body: base.body,
      status: "loading",
      problem: null,
      conflict: null,
      locked: false,
    };
  }
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    if (annotationDraftSnapshot(this.key).ready) {
      this.restore();
      return;
    }
    const unsubscribe = subscribeAnnotationDrafts(() => {
      if (annotationDraftSnapshot(this.key).ready) {
        unsubscribe();
        this.restore();
      }
    });
    void loadAnnotationDraft(this.key);
  }
  getSnapshot = (): AnnotationEditSnapshot => this.snapshot;
  getText = (): string => this.snapshot.body;
  getAnnotation = (): Annotation => this.base;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  receive(annotation: Annotation): void {
    if (annotation.recordRevision && this.seen.has(annotation.recordRevision)) {
      return;
    }
    this.seen.add(annotation.recordRevision);
    if (this.snapshot.status === "loading") {
      this.base = annotation;
      return;
    }
    if (annotation.body === this.snapshot.body) {
      this.base = annotation;
      this.clear();
      return;
    }
    const dirty = this.snapshot.body !== this.base.body;
    if (
      dirty &&
      annotation.body !== this.base.body &&
      annotation.body !== this.snapshot.body &&
      annotation.body !== this.savingBody
    ) {
      clearTimeout(this.timer);
      this.update({ conflict: annotation });
      return;
    }
    this.base = annotation;
    if (!dirty) {
      this.update({ body: annotation.body, status: "saved" });
    }
  }
  edit = (body: string): void => {
    if (this.snapshot.locked || this.snapshot.status === "loading") {
      return;
    }
    this.update({ body, status: this.inFlight ? "saving" : "unsaved", problem: null });
    this.store();
    this.schedule();
  };
  save = (): Promise<void> => {
    clearTimeout(this.timer);
    if (this.inFlight) {
      return this.inFlight;
    }
    if (
      this.snapshot.conflict ||
      this.snapshot.locked ||
      this.snapshot.status === "loading" ||
      this.snapshot.status === "saved"
    ) {
      return Promise.resolve();
    }
    if (this.snapshot.body === this.base.body) {
      this.clear();
      return Promise.resolve();
    }
    this.savingBody = this.snapshot.body;
    this.update({ status: "saving", problem: null });
    this.inFlight = this.write(this.base, this.savingBody).finally(() => {
      this.inFlight = undefined;
      this.savingBody = undefined;
      if (this.snapshot.status === "unsaved") {
        this.schedule();
      }
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
      this.update({ body: remote.body });
      this.clear();
    } else {
      this.update({ status: "unsaved" });
      this.store();
      this.schedule();
    }
  };
  /** Freeze every view before planning/deleting, and drain the one outstanding write. */
  lock = async (owner: object = this): Promise<boolean> => {
    if (this.lockOwner) {
      return false;
    }
    this.lockOwner = owner;
    this.update({ locked: true });
    clearTimeout(this.timer);
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
    this.schedule();
  };
  deleted = (): void => {
    clearTimeout(this.timer);
    saveAnnotationDraft(this.key, null);
    this.update({ locked: true, status: "saved" });
  };
  private restore(): void {
    const value = annotationDraftSnapshot(this.key).value;
    this.update({
      body: value?.body ?? this.base.body,
      status: value ? "unsaved" : "saved",
      conflict:
        value && value.baseBody !== this.base.body && value.body !== this.base.body
          ? this.base
          : null,
    });
    if (value) {
      this.schedule();
    }
  }
  private async write(base: Annotation, body: string): Promise<void> {
    try {
      const saved = await this.persist(base, body);
      this.base = saved;
      this.seen.add(saved.recordRevision);
      if (this.snapshot.body === saved.body && !this.snapshot.conflict) {
        this.clear();
      } else {
        this.update({ status: "unsaved" });
        this.store();
      }
    } catch (reason) {
      const latest = await this.refresh?.(this.base).catch(() => null);
      if (latest) {
        this.receive(latest);
        if (latest.body === this.snapshot.body && !this.snapshot.conflict) {
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
              "Could not save changes to the collection. Your local changes are retained.",
            ),
      });
    }
  }
  private clear(): void {
    saveAnnotationDraft(this.key, null);
    this.update({ status: "saved", problem: null, conflict: null });
  }
  private store(): void {
    saveAnnotationDraft(this.key, { body: this.snapshot.body, baseBody: this.base.body });
  }
  private schedule(): void {
    clearTimeout(this.timer);
    if (!this.snapshot.locked && !this.snapshot.conflict && this.snapshot.status === "unsaved") {
      this.timer = setTimeout(() => void this.save(), 1000);
    }
  }
  private update(value: Partial<AnnotationEditSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...value };
    this.listeners.forEach((listener) => listener());
  }
}
const sessions = new WeakMap<object, Map<string, AnnotationEditSession>>();
export function annotationEditSession(
  scope: object,
  annotation: Annotation,
  persist: PersistAnnotation,
  refresh?: (annotation: Annotation) => Promise<Annotation | null>,
): AnnotationEditSession {
  let cache = sessions.get(scope);
  if (!cache) {
    cache = new Map();
    sessions.set(scope, cache);
  }
  const key = annotationDraftKey(annotation.collectionId, annotation.sourceId, annotation.id);
  let session = cache.get(key);
  if (!session) {
    session = new AnnotationEditSession(annotation, persist, refresh);
    cache.set(key, session);
  }
  return session;
}

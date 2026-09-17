import { clearLegacyEdits, readLegacyEdits } from "./annotation-edit-recovery.js";
import { readerErrorMessage } from "./errors.js";
import { trackAnnotationEdits } from "./unsaved-annotation-edits.js";

import type { AnnotationEditSnapshot, PersistAnnotation } from "./annotation-edit-types.js";
import type { Annotation } from "@mdbase-reader/core";

export type { AnnotationEditSnapshot, PersistAnnotation } from "./annotation-edit-types.js";
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
  private incoming: Annotation[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private editedAt = 0;
  private started = false;
  private legacy = false;
  private lockOwner: object | undefined;
  private editorOwner: object | undefined;
  private seen = new Set<string | undefined>();
  constructor(
    private base: Annotation,
    private readonly persist: PersistAnnotation,
    private readonly refresh?: (annotation: Annotation) => Promise<Annotation | null>,
  ) {
    this.key = JSON.stringify([base.collectionId, base.sourceId, base.id]);
    this.body = base.body;
    this.seen.add(base.recordRevision);
  }
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    readLegacyEdits(this.key, (value) => {
      this.legacy = value !== null;
      this.body = value?.body ?? this.base.body;
      this.update({
        status: value ? "unsaved" : "saved",
        textVersion: this.snapshot.textVersion + 1,
        conflict:
          value && value.baseBody !== this.base.body && value.body !== this.base.body
            ? this.base
            : null,
      });
    });
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
    if (annotation.recordRevision && this.seen.has(annotation.recordRevision)) {
      return;
    }
    // Publication can precede the write result and contain serializer-normalized text.
    if (this.inFlight || this.snapshot.status === "saving") {
      this.incoming.push(annotation);
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
    if (dirty && annotation.body !== this.base.body && annotation.body !== this.body) {
      clearTimeout(this.timer);
      this.update({ conflict: annotation, problem: null });
      return;
    }
    this.base = annotation;
    if (!dirty) {
      this.clear();
    }
  }
  edit = (body: string): void => {
    if (this.snapshot.locked || this.snapshot.status === "loading" || body === this.body) {
      return;
    }
    this.body = body;
    this.editedAt = Date.now();
    this.update({ status: this.inFlight ? "saving" : "unsaved", problem: null });
    this.schedule();
  };
  save = (): Promise<void> => {
    clearTimeout(this.timer);
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
      for (const annotation of this.incoming.splice(0)) {
        this.receive(annotation);
      }
      this.update({});
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
      this.clear();
    } else {
      this.update({ status: "unsaved" });
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
    clearTimeout(this.timer);
    this.update({ locked: true });
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
    if (this.snapshot.status === "unsaved" && this.editedAt) {
      this.schedule();
    }
  };
  deleted = (): void => {
    this.clear();
    this.update({ locked: true });
  };
  private async write(base: Annotation, body: string): Promise<void> {
    try {
      const saved = await this.persist(base, body);
      this.base = saved;
      this.seen.add(saved.recordRevision);
      if (this.body === body && !this.snapshot.conflict) {
        this.clear();
      } else {
        this.update({ status: "unsaved" });
      }
    } catch (reason) {
      const latest = await this.refresh?.(this.base).catch(() => null);
      if (latest) {
        this.receive(latest);
        if (latest.body === this.body) {
          this.base = latest;
          this.clear();
          return;
        }
      }
      this.update({
        status: "error",
        problem: this.snapshot.conflict
          ? null
          : readerErrorMessage(reason, "Could not save. Keep Reader open and retry."),
      });
    }
  }
  private clear(): void {
    clearTimeout(this.timer);
    this.body = this.base.body;
    if (this.legacy) {
      clearLegacyEdits(this.key);
      this.legacy = false;
    }
    this.update({
      status: "saved",
      problem: null,
      conflict: null,
      textVersion: this.snapshot.textVersion + 1,
    });
  }
  private schedule(): void {
    clearTimeout(this.timer);
    if (!this.snapshot.locked && !this.snapshot.conflict) {
      const delay = Math.max(0, this.editedAt + 1000 - Date.now());
      this.timer = setTimeout(() => void this.save(), delay);
    }
  }
  private update(value: Partial<AnnotationEditSnapshot>): void {
    const next = { ...this.snapshot, ...value };
    trackAnnotationEdits(
      this,
      this.base,
      this.body !== this.base.body ||
        Boolean(next.conflict) ||
        Boolean(this.inFlight) ||
        next.status === "saving",
    );
    const keys = Object.keys(value) as (keyof AnnotationEditSnapshot)[];
    if (keys.every((key) => this.snapshot[key] === value[key])) {
      return;
    }
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}

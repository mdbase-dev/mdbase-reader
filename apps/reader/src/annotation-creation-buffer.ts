import {
  annotationDraftSnapshot,
  whenAnnotationDraftReady,
  type AnnotationLocalDraft,
} from "./annotation-drafts.js";
import { clearLegacyEdits } from "./annotation-edit-recovery.js";
import { trackAnnotationEdits } from "./unsaved-annotation-edits.js";

import type { Annotation } from "@mdbase-reader/core";

type Scope = Pick<Annotation, "collectionId" | "sourceId">;
interface CreationSnapshot {
  readonly ready: boolean;
  readonly value: AnnotationLocalDraft | null;
}
/** An unfinished selection stays in memory across source switches, never in device storage. */
export class AnnotationCreationBuffer {
  private value: AnnotationLocalDraft | null = null;
  private snapshot: CreationSnapshot = { ready: false, value: null };
  private readonly listeners = new Set<() => void>();
  private started = false;
  private legacy = false;
  constructor(
    private readonly key: string,
    private readonly scope?: Scope,
  ) {}
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    if (!this.key) {
      this.publish();
      return;
    }
    whenAnnotationDraftReady(this.key, () => {
      this.value = annotationDraftSnapshot(this.key).value;
      this.legacy = this.value !== null;
      this.publish();
    });
  }
  get = (): AnnotationLocalDraft | null => this.value;
  getSnapshot = (): CreationSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  edit(body: string): void {
    if (this.value) {
      this.value = { ...this.value, body };
      this.track();
    }
  }
  replace(value: AnnotationLocalDraft | null): void {
    if (this.legacy) {
      clearLegacyEdits(this.key);
      this.legacy = false;
    }
    this.value = value;
    this.publish();
  }
  clearIf(value: AnnotationLocalDraft): void {
    if (this.value === value) {
      this.replace(null);
    }
  }
  private publish(): void {
    this.snapshot = { ready: true, value: this.value };
    this.track();
    this.listeners.forEach((listener) => listener());
  }
  /** Only written words or a captured area are worth warning about; a bare selection is not. */
  private track(): void {
    if (this.scope) {
      const value = this.value;
      trackAnnotationEdits(
        this,
        this.scope,
        value !== null && (value.selection?.kind === "area" || value.body.trim() !== ""),
      );
    }
  }
}
const buffers = new Map<string, AnnotationCreationBuffer>();
export function annotationCreationBuffer(key: string, scope?: Scope): AnnotationCreationBuffer {
  let buffer = buffers.get(key);
  if (!buffer) {
    buffer = new AnnotationCreationBuffer(key, scope);
    buffers.set(key, buffer);
  }
  return buffer;
}

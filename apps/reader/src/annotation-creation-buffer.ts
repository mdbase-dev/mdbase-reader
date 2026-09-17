import {
  annotationDraftSnapshot,
  flushAnnotationDraft,
  saveAnnotationDraft,
  stageAnnotationDraft,
  type AnnotationLocalDraft,
} from "./annotation-drafts.js";
import { LocalDraftCheckpoint } from "./local-draft-checkpoint.js";

/** Creation text stays off the workspace subscription path until a recovery checkpoint. */
export class AnnotationCreationBuffer {
  private pending: AnnotationLocalDraft | undefined;
  private readonly checkpoint = new LocalDraftCheckpoint(() => {
    const value = this.pending;
    this.pending = undefined;
    if (value) {
      saveAnnotationDraft(this.key, value);
      flushAnnotationDraft(this.key);
    }
  });
  constructor(private readonly key: string) {}
  get(): AnnotationLocalDraft | null {
    return this.pending ?? annotationDraftSnapshot(this.key).value;
  }
  edit(body: string): void {
    const value = this.get();
    if (!value) {
      return;
    }
    this.pending = { ...value, body };
    const pending = this.checkpoint.isPending();
    this.checkpoint.schedule();
    if (!pending) {
      stageAnnotationDraft(this.key, this.pending);
    }
  }
  replace(value: AnnotationLocalDraft | null): void {
    this.checkpoint.cancel();
    this.pending = undefined;
    saveAnnotationDraft(this.key, value);
  }
  flush = (): void => {
    this.checkpoint.flush();
    flushAnnotationDraft(this.key);
  };
}

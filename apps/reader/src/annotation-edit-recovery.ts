import {
  annotationDraftSnapshot,
  saveAnnotationDraft,
  whenAnnotationDraftReady,
  type AnnotationLocalDraft,
} from "./annotation-drafts.js";

/** Also reads unfinished comments written by older Reader versions. */
export function readLegacyEdits(
  key: string,
  ready: (value: AnnotationLocalDraft | null) => void,
): void {
  whenAnnotationDraftReady(key, () => ready(annotationDraftSnapshot(key).value));
}
export function clearLegacyEdits(key: string): void {
  saveAnnotationDraft(key, null);
}

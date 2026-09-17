import {
  annotationDraftSnapshot,
  saveAnnotationDraft,
  whenAnnotationDraftReady,
} from "./annotation-drafts.js";

export interface LegacyAnnotationEdits {
  readonly body: string;
  readonly baseBody?: string;
}
/** Compatibility only: do not discard unfinished comments written by older Reader versions. */
export function readLegacyEdits(
  key: string,
  ready: (value: LegacyAnnotationEdits | null) => void,
): void {
  whenAnnotationDraftReady(key, () => ready(annotationDraftSnapshot(key).value));
}
export function clearLegacyEdits(key: string): void {
  saveAnnotationDraft(key, null);
}

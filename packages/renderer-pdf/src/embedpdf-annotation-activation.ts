import { annotationId } from "@mdbase-reader/core";

import type { PdfPageRect } from "./pdf-viewport-rect.js";
import type { AnnotationPlugin } from "@embedpdf/plugin-annotation";
import type { AnnotationId } from "@mdbase-reader/core";
import type { Unsubscribe } from "@mdbase-reader/reading-surface";

type AnnotationCapability = ReturnType<AnnotationPlugin["provides"]>;

export interface EmbedPdfAnnotationActivations {
  /** The reader clicked a Reader highlight, including one already selected. */
  subscribe(listener: (annotationId: AnnotationId) => void): Unsubscribe;
  /** The reader let go of the selected Reader highlight in the page, as by clicking empty page. */
  subscribeDismissals(listener: () => void): Unsubscribe;
  /**
   * Changes EmbedPDF's selection on Reader's behalf. What this selects, or lets go, is Reader
   * showing its own choice; it is not the reader's, so it is never reported back as theirs.
   */
  applying(change: () => void): void;
  /** The page rectangle of the highlight activated last, for placing its actions. */
  activatedRect(): PdfPageRect | null;
  destroy(): void;
}

/**
 * Reports the reader's own selections of Reader highlights. EmbedPDF has one selection, which
 * both shows Reader's active highlight and takes the reader's clicks, so the two are told apart
 * here: changes made through `applying` are Reader's, and every other one is the reader's.
 */
export function createEmbedPdfAnnotationActivations(
  capability: AnnotationCapability,
): EmbedPdfAnnotationActivations {
  const listeners = new Set<(annotationId: AnnotationId) => void>();
  const dismissals = new Set<() => void>();
  let applyingDepth = 0;
  // Each click on an annotation dispatches a fresh selection, even of the one already selected,
  // so a new selection list (not merely a new id) is what marks a click.
  let selection: readonly string[] | null = null;
  let selectedId: AnnotationId | null = null;
  let selectedRect: PdfPageRect | null = null;
  const unsubscribe = capability.onStateChange(({ state }) => {
    if (state.selectedUids === selection) {
      return;
    }
    selection = state.selectedUids;
    const selected = capability
      .getSelectedAnnotations()
      .find(({ object }) => object.id.startsWith("mdbase-reader:"));
    const nextId = selected ? annotationId(readerAnnotationId(selected.object)) : null;
    const previousId = selectedId;
    selectedId = nextId;
    if (applyingDepth > 0) {
      return;
    }
    if (selected && nextId) {
      selectedRect = { pageIndex: selected.object.pageIndex, rect: selected.object.rect };
      listeners.forEach((listener) => listener(nextId));
    } else if (previousId) {
      dismissals.forEach((listener) => listener());
    }
  });
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeDismissals(listener) {
      dismissals.add(listener);
      return () => dismissals.delete(listener);
    },
    applying(change) {
      applyingDepth += 1;
      try {
        change();
      } finally {
        applyingDepth -= 1;
      }
    },
    activatedRect: () => selectedRect,
    destroy() {
      unsubscribe();
      listeners.clear();
      dismissals.clear();
    },
  };
}

/** The Reader annotation a decoration stands for; margin marks share their highlight's id. */
function readerAnnotationId(object: { readonly id: string; readonly custom?: unknown }): string {
  const custom = object.custom;
  const declared: unknown =
    custom !== null && typeof custom === "object" ? Reflect.get(custom, "annotationId") : undefined;
  return typeof declared === "string" ? declared : object.id.slice("mdbase-reader:".length);
}

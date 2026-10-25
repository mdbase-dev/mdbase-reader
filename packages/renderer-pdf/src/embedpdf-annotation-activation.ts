import { annotationId } from "@mdbase-reader/core";

import type { PdfPageRect } from "./pdf-viewport-rect.js";
import type { AnnotationPlugin } from "@embedpdf/plugin-annotation";
import type { AnnotationId } from "@mdbase-reader/core";
import type { Unsubscribe } from "@mdbase-reader/reading-surface";

type AnnotationCapability = ReturnType<AnnotationPlugin["provides"]>;

export interface EmbedPdfAnnotationActivations {
  subscribe(listener: (annotationId: AnnotationId) => void): Unsubscribe;
  /** The page rectangle of the highlight activated last, for placing its actions. */
  activatedRect(): PdfPageRect | null;
  destroy(): void;
}

export function createEmbedPdfAnnotationActivations(
  capability: AnnotationCapability,
): EmbedPdfAnnotationActivations {
  const listeners = new Set<(annotationId: AnnotationId) => void>();
  let selectedId: AnnotationId | null = null;
  let selectedRect: PdfPageRect | null = null;
  const unsubscribe = capability.onStateChange(() => {
    const selected = capability
      .getSelectedAnnotations()
      .find(({ object }) => object.id.startsWith("mdbase-reader:"));
    const nextId = selected ? annotationId(readerAnnotationId(selected.object)) : null;
    if (selected && nextId && nextId !== selectedId) {
      selectedRect = { pageIndex: selected.object.pageIndex, rect: selected.object.rect };
      listeners.forEach((listener) => listener(nextId));
    }
    selectedId = nextId;
  });
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    activatedRect: () => selectedRect,
    destroy() {
      unsubscribe();
      listeners.clear();
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

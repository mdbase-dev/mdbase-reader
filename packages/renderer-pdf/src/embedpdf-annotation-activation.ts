import { annotationId } from "@mdbase-reader/core";

import type { PdfPageRect } from "./pdf-viewport-rect.js";
import type { PdfAnnotationObject } from "@embedpdf/models";
import type { AnnotationPlugin } from "@embedpdf/plugin-annotation";
import type { AnnotationId } from "@mdbase-reader/core";
import type { Unsubscribe, ViewportRect } from "@mdbase-reader/reading-surface";

type AnnotationCapability = ReturnType<AnnotationPlugin["provides"]>;

type LocatePageRects = (rects: readonly PdfPageRect[]) => ViewportRect | null;

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
  /** A press began in the page; whatever it selects is a click of its own. */
  pointerDown(): void;
  /**
   * The press ended as a click at this point on screen. A click on the highlight already
   * selected changes nothing EmbedPDF reports, so it is recognised here by where it landed.
   */
  pointerClicked(point: { readonly x: number; readonly y: number }): void;
  /** The page rectangle of the highlight activated last, for placing its actions. */
  activatedRect(): PdfPageRect | null;
  destroy(): void;
}

/**
 * Reports the reader's own selections of Reader highlights. EmbedPDF has one selection, which
 * both shows Reader's active highlight and takes the reader's clicks, so the two are told apart
 * here: changes made through `applying` are Reader's, and every other one is the reader's.
 *
 * EmbedPDF reports a state only when it differs from the last one it reported, so a click on the
 * highlight already selected, whether the reader or Reader selected it, reports nothing. Given
 * `locate`, such a click is recognised from where it landed instead (see `pointerClicked`).
 */
export function createEmbedPdfAnnotationActivations(
  capability: AnnotationCapability,
  locate?: LocatePageRects,
): EmbedPdfAnnotationActivations {
  const listeners = new Set<(annotationId: AnnotationId) => void>();
  const dismissals = new Set<() => void>();
  let applyingDepth = 0;
  // Other changes to EmbedPDF's state keep the same selection list; only a selection makes one.
  let selection: readonly string[] | null = null;
  let selectedId: AnnotationId | null = null;
  let selectedRect: PdfPageRect | null = null;
  let activatedThisPress = false;
  const readerSelection = (): PdfAnnotationObject | null =>
    capability.getSelectedAnnotations().find(({ object }) => object.id.startsWith("mdbase-reader:"))
      ?.object ?? null;
  const activate = (object: PdfAnnotationObject, id: AnnotationId): void => {
    activatedThisPress = true;
    selectedRect = { pageIndex: object.pageIndex, rect: object.rect };
    listeners.forEach((listener) => listener(id));
  };
  const unsubscribe = capability.onStateChange(({ state }) => {
    if (state.selectedUids === selection) {
      return;
    }
    selection = state.selectedUids;
    const selected = readerSelection();
    const nextId = selected ? annotationId(readerAnnotationId(selected)) : null;
    const previousId = selectedId;
    selectedId = nextId;
    if (applyingDepth > 0) {
      return;
    }
    if (selected && nextId) {
      activate(selected, nextId);
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
    pointerDown() {
      activatedThisPress = false;
    },
    pointerClicked(point) {
      if (activatedThisPress || !locate) {
        return;
      }
      const selected = readerSelection();
      if (selected && selectedId && landsOn(selected, point, locate)) {
        activate(selected, selectedId);
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

/** A press that travels further than this, in CSS pixels, selects text rather than clicking. */
const clickSlop = 5;

/**
 * Tells the activations of each press in the viewer and of each that ends as a click. Capture
 * listeners hear the press before EmbedPDF can stop it; the click is judged once EmbedPDF has
 * finished handling it, so a selection it made counts first.
 */
export function observePagePresses(
  host: HTMLElement | null | undefined,
  activations: Pick<EmbedPdfAnnotationActivations, "pointerDown" | "pointerClicked">,
): Unsubscribe {
  if (!host) {
    return () => undefined;
  }
  let start: { readonly x: number; readonly y: number; readonly id: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const down = (event: PointerEvent): void => {
    if (event.button !== 0 && event.pointerType === "mouse") {
      return;
    }
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    activations.pointerDown();
  };
  const up = (event: PointerEvent): void => {
    const pressed = start;
    start = null;
    if (
      pressed?.id !== event.pointerId ||
      Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > clickSlop
    ) {
      return;
    }
    const point = { x: event.clientX, y: event.clientY };
    clearTimeout(timer);
    timer = setTimeout(() => activations.pointerClicked(point), 0);
  };
  host.addEventListener("pointerdown", down, true);
  host.addEventListener("pointerup", up, true);
  return () => {
    clearTimeout(timer);
    host.removeEventListener("pointerdown", down, true);
    host.removeEventListener("pointerup", up, true);
  };
}

/** Whether a point on screen lies on a decoration: on one of a highlight's lines, or its box. */
function landsOn(
  object: PdfAnnotationObject,
  point: { readonly x: number; readonly y: number },
  locate: LocatePageRects,
): boolean {
  const lines: unknown = Reflect.get(object, "segmentRects");
  const rects =
    Array.isArray(lines) && lines.length > 0
      ? (lines as PdfAnnotationObject["rect"][])
      : [object.rect];
  return rects.some((rect) => {
    const placed = locate([{ pageIndex: object.pageIndex, rect }]);
    return (
      placed !== null &&
      point.x >= placed.x &&
      point.x <= placed.x + placed.width &&
      point.y >= placed.y &&
      point.y <= placed.y + placed.height
    );
  });
}

/** The Reader annotation a decoration stands for; margin marks share their highlight's id. */
function readerAnnotationId(object: { readonly id: string; readonly custom?: unknown }): string {
  const custom = object.custom;
  const declared: unknown =
    custom !== null && typeof custom === "object" ? Reflect.get(custom, "annotationId") : undefined;
  return typeof declared === "string" ? declared : object.id.slice("mdbase-reader:".length);
}

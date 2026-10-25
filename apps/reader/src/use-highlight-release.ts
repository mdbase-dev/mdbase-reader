import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";

import type { SelectionToolbarController } from "./use-selection-toolbar.js";
import type { Annotation, AnnotationId } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

// Escape belongs to these first, as it does for the highlight-saved notice.
const openOverlays = "dialog[open], [aria-modal='true'], .library-row-menu";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  );
}

/**
 * Letting a highlight go closes its actions and leaves no highlight active, in the panel as in
 * the document. It goes on Escape, from the toolbar or with nothing else to take the key, and
 * where the document reports the reader let it go, as on a click on empty page.
 *
 * A highlight whose comment is being written stays: the editor keeps it, and the document is
 * shown it again if it let it go.
 */
export function useHighlightRelease(
  surface: ReadingSurface | null,
  annotations: readonly Annotation[],
  toolbar: Pick<SelectionToolbarController, "state" | "hideAnnotation">,
  selection: {
    readonly activeId: AnnotationId | null;
    readonly editingId: AnnotationId | null;
    readonly setActiveId: Dispatch<SetStateAction<AnnotationId | null>>;
    /** The highlight-saved notice is open, and takes Escape first. */
    readonly noticeOpen: boolean;
  },
): (annotationId: AnnotationId) => void {
  const listed = (id: AnnotationId | null): AnnotationId | null =>
    annotations.some((annotation) => annotation.id === id) ? id : null;
  const activeId = listed(selection.activeId);
  const editingId = listed(selection.editingId);
  const { setActiveId } = selection;
  const hideAnnotationToolbar = toolbar.hideAnnotation;
  // The toolbar takes Escape for itself while it is open.
  const escapeTaken = toolbar.state !== null || selection.noticeOpen;
  const release = useCallback(
    (annotationId: AnnotationId): void => {
      hideAnnotationToolbar(annotationId);
      if (annotationId === editingId) {
        const editing = annotations.find(({ id }) => id === annotationId) ?? null;
        void surface?.capabilities.decorations?.setActiveAnnotation(editing);
        return;
      }
      setActiveId((id) => (id === annotationId ? null : id));
    },
    [annotations, editingId, hideAnnotationToolbar, setActiveId, surface],
  );
  useEffect(
    () =>
      surface?.capabilities.annotationActivation?.dismissals?.subscribe(() => {
        if (activeId) {
          release(activeId);
        }
      }),
    [activeId, release, surface],
  );
  useEffect(() => {
    if (!activeId || escapeTaken) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !isTyping(event.target) &&
        !document.querySelector(openOverlays)
      ) {
        release(activeId);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeId, escapeTaken, release]);
  return release;
}

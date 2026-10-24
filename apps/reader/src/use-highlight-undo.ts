import { useCallback, useRef, useState } from "react";

import type { Annotation, HighlightColorKey } from "@mdbase-reader/core";
import type { ViewportRect } from "@mdbase-reader/reading-surface";

/**
 * A highlight just made from a selection. The ink sweeps as soon as it is chosen, since the
 * highlight is drawn at once; Undo is offered once the collection has saved it.
 */
export interface SavedHighlight {
  readonly id: number;
  readonly color: HighlightColorKey;
  /** Where the passage was on screen, for the sweep; null when unknown. */
  readonly rect: ViewportRect | null;
  readonly status: "saving" | "saved" | "undoing" | "failed";
  readonly annotation: Annotation | null;
}

/** Reports one quick highlight's save to the confirmation. */
export interface HighlightSaveTracker {
  readonly saved: (annotation: Annotation) => void;
  /** The save finished: clears the confirmation unless it was saved. */
  readonly settled: () => void;
}

export interface HighlightUndoController {
  readonly savedHighlight: SavedHighlight | null;
  readonly trackHighlight: (
    color: HighlightColorKey,
    rect: ViewportRect | null,
  ) => HighlightSaveTracker;
  /** Deletes the highlight just saved, as Delete highlight would. */
  readonly undoSavedHighlight: () => void;
  readonly dismissSavedHighlight: () => void;
}

/**
 * Undo reuses deletion. Its plan checks that nothing embeds the highlight yet, which holds for
 * one saved moments ago unless a note already took it; then Undo says it could not.
 */
export function useHighlightUndo(
  remove: (annotation: Annotation) => Promise<readonly string[]>,
): HighlightUndoController {
  const [saved, setSaved] = useState<SavedHighlight | null>(null);
  const next = useRef(0);
  const update = useCallback(
    (id: number, change: (value: SavedHighlight) => SavedHighlight | null) =>
      setSaved((latest) => (latest?.id === id ? change(latest) : latest)),
    [],
  );
  const trackHighlight = useCallback(
    (color: HighlightColorKey, rect: ViewportRect | null): HighlightSaveTracker => {
      next.current += 1;
      const id = next.current;
      setSaved({ id, color, rect, status: "saving", annotation: null });
      return {
        saved: (annotation) => update(id, (value) => ({ ...value, status: "saved", annotation })),
        settled: () => update(id, (value) => (value.status === "saving" ? null : value)),
      };
    },
    [update],
  );
  const undoSavedHighlight = useCallback(() => {
    if (saved?.status !== "saved" || !saved.annotation) {
      return;
    }
    const { id, annotation } = saved;
    update(id, (value) => ({ ...value, status: "undoing" }));
    void remove(annotation).then(
      (embeddedIn) =>
        update(id, (value) => (embeddedIn.length > 0 ? { ...value, status: "failed" } : null)),
      () => update(id, (value) => ({ ...value, status: "failed" })),
    );
  }, [remove, saved, update]);
  const dismissSavedHighlight = useCallback(() => setSaved(null), []);
  return { savedHighlight: saved, trackHighlight, undoSavedHighlight, dismissSavedHighlight };
}

import { useCallback, useRef, useState } from "react";

import { readerErrorMessage } from "./errors.js";

import type { Annotation, HighlightColorKey } from "@mdbase-reader/core";
import type { ViewportRect } from "@mdbase-reader/reading-surface";

/**
 * A highlight just made from a selection. The ink sweeps as soon as it is chosen, since the
 * highlight is drawn at once; Undo is offered once the collection has saved it.
 *
 * `embedded` means a note already embeds the highlight, so Undo left it in place; `failed` means
 * the deletion itself went wrong, as `problem` says.
 */
export interface SavedHighlight {
  readonly id: number;
  readonly color: HighlightColorKey;
  /** Where the passage was on screen, for the sweep; null when unknown. */
  readonly rect: ViewportRect | null;
  readonly status: "saving" | "saved" | "undoing" | "embedded" | "failed";
  readonly annotation: Annotation | null;
  readonly problem?: string | undefined;
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

export interface HighlightUndoInput {
  /** The annotations as they are now, so Undo deletes the current revision. */
  readonly annotations: readonly Annotation[];
  /**
   * What the highlight was made in, such as the source and its document. Undo is offered only
   * there: the confirmation goes when either changes. Keep it stable between renders.
   */
  readonly scope: readonly unknown[];
  /** Deletes an annotation that nothing embeds, or returns the notes that embed it. */
  readonly remove: (annotation: Annotation) => Promise<readonly string[]>;
}

const undoFailed = "Reader could not delete this highlight.";

function sameScope(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Undo reuses deletion. Its plan checks that nothing embeds the highlight yet, which holds for
 * one saved moments ago unless a note already took it; then Undo says so.
 */
export function useHighlightUndo({
  annotations,
  scope,
  remove,
}: HighlightUndoInput): HighlightUndoController {
  const [state, setState] = useState<{
    readonly highlight: SavedHighlight;
    readonly scope: readonly unknown[];
  } | null>(null);
  // Leaving the source or document ends the offer, so Undo never reaches a page left behind.
  if (state && !sameScope(state.scope, scope)) {
    setState(null);
  }
  const saved = state && sameScope(state.scope, scope) ? state.highlight : null;
  const next = useRef(0);
  const update = useCallback(
    (id: number, change: (value: SavedHighlight) => SavedHighlight | null) =>
      setState((latest) => {
        if (latest?.highlight.id !== id) {
          return latest;
        }
        const highlight = change(latest.highlight);
        return highlight ? { ...latest, highlight } : null;
      }),
    [],
  );
  const trackHighlight = useCallback(
    (color: HighlightColorKey, rect: ViewportRect | null): HighlightSaveTracker => {
      next.current += 1;
      const id = next.current;
      setState({ scope, highlight: { id, color, rect, status: "saving", annotation: null } });
      return {
        saved: (annotation) => update(id, (value) => ({ ...value, status: "saved", annotation })),
        settled: () => update(id, (value) => (value.status === "saving" ? null : value)),
      };
    },
    [scope, update],
  );
  const undoSavedHighlight = useCallback(() => {
    if (saved?.status !== "saved" || !saved.annotation) {
      return;
    }
    const { id, annotation: created } = saved;
    // A recolour or comment since saving made a newer revision; delete that one.
    const current = annotations.find(({ id: annotationId }) => annotationId === created.id);
    update(id, (value) => ({ ...value, status: "undoing" }));
    void remove(current ?? created).then(
      (embeddedIn) =>
        update(id, (value) => (embeddedIn.length > 0 ? { ...value, status: "embedded" } : null)),
      (reason: unknown) =>
        update(id, (value) => ({
          ...value,
          status: "failed",
          problem: readerErrorMessage(reason, undoFailed),
        })),
    );
  }, [annotations, remove, saved, update]);
  const dismissSavedHighlight = useCallback(() => setState(null), []);
  return { savedHighlight: saved, trackHighlight, undoSavedHighlight, dismissSavedHighlight };
}

import { useCallback, useEffect, useState } from "react";

import { recentPointerRect } from "./use-selection-anchor.js";

import type { ComposerSelection } from "./annotation-composer-request.js";
import type { Annotation } from "@mdbase-reader/core";
import type { ReadingSurface, ViewportRect } from "@mdbase-reader/reading-surface";

export type TextComposerSelection = Extract<ComposerSelection, { readonly kind: "text" }>;

/** Quick actions for what the reader just selected, or for a highlight they clicked. */
export type SelectionToolbarTarget =
  | { readonly kind: "selection"; readonly selection: TextComposerSelection }
  | { readonly kind: "annotation"; readonly annotation: Annotation };

export interface SelectionToolbarState {
  readonly target: SelectionToolbarTarget;
  /** Where to place the toolbar; null docks it at the bottom of the document. */
  readonly rect: ViewportRect | null;
}

export interface SelectionToolbarController {
  readonly state: SelectionToolbarState | null;
  readonly showSelection: (selection: TextComposerSelection) => void;
  readonly showAnnotation: (annotation: Annotation) => void;
  readonly hide: () => void;
}

// Matches the workspace's phone layout, where selection actions sit in the bottom bar.
function phoneLayout(): boolean {
  return globalThis.matchMedia("(max-width: 680px)").matches;
}

/**
 * The toolbar follows the live selection: it goes when the selection is cleared, when a click in
 * the document selects nothing, and when the document moves, since its position would be stale.
 * A phone is the exception: it scrolls while selection handles are dragged, and shows a
 * selection's actions in its bottom bar, where they have no position to go stale.
 */

export function useSelectionToolbar(surface: ReadingSurface | null): SelectionToolbarController {
  const [current, setCurrent] = useState<{
    readonly surface: ReadingSurface;
    readonly state: SelectionToolbarState;
  } | null>(null);
  const hide = useCallback(() => setCurrent(null), []);
  useEffect(() => {
    if (!surface) {
      return undefined;
    }
    const cleared = surface.capabilities.textSelection?.cleared?.subscribe(hide);
    const moved = surface.locations.subscribe(() =>
      setCurrent((value) =>
        value?.state.target.kind === "selection" && phoneLayout() ? value : null,
      ),
    );
    return () => {
      cleared?.();
      moved();
    };
  }, [surface, hide]);
  return {
    state: current?.surface === surface ? current.state : null,
    showSelection: (selection) => {
      if (surface) {
        const rect = selection.value.anchor ?? recentPointerRect();
        setCurrent({ surface, state: { target: { kind: "selection", selection }, rect } });
      }
    },
    showAnnotation: (annotation) => {
      if (surface) {
        setCurrent({
          surface,
          state: {
            target: { kind: "annotation", annotation },
            rect:
              surface.capabilities.annotationActivation?.activationRect?.() ?? recentPointerRect(),
          },
        });
      }
    },
    hide,
  };
}

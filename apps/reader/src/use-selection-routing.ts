import { useEffect, useRef, type RefObject } from "react";

import { confirmAnnotationDiscard } from "./annotation-draft-actions.js";
import { subscribeToSelections } from "./annotation-selection.js";
import { highlightOnSelect } from "./highlight-preference.js";
import { selectionRoute } from "./selection-routing.js";

import type { ComposerSelection } from "./annotation-composer-request.js";
import type { AnnotationCreationBuffer } from "./annotation-creation-buffer.js";
import type { TextComposerSelection } from "./use-selection-toolbar.js";
import type { SourceId } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

/** Sends each selection the surface reports to the toolbar, the composer, or an instant highlight. */
export function useSelectionRouting(input: {
  readonly key: string;
  readonly sourceId: SourceId | null;
  readonly surface: ReadingSurface | null;
  readonly buffer: AnnotationCreationBuffer;
  readonly paused: boolean;
  readonly busy: RefObject<boolean>;
  readonly offerSwitch: (value: ComposerSelection) => void;
  readonly compose: (value: ComposerSelection) => void;
  readonly highlight: (value: TextComposerSelection) => void;
  readonly showToolbar: (value: TextComposerSelection) => void;
}): void {
  const { key, sourceId, surface } = input;
  const route = (value: ComposerSelection): void => {
    const previous = input.buffer.get();
    const decision = selectionRoute({
      value,
      draft: previous,
      paused: input.paused,
      busy: input.busy.current,
      instant: highlightOnSelect() === "instant",
    });
    if (decision === "offer-switch") {
      input.offerSwitch(value);
    } else if (decision === "compose") {
      input.compose(value);
    } else if (decision === "confirm-compose") {
      if (
        confirmAnnotationDiscard("Discard the unfinished annotation comment and use this area?")
      ) {
        input.compose(value);
      }
    } else if (value.kind === "text" && (decision === "highlight" || decision === "toolbar")) {
      // An untouched comment gives way to the new selection; written words stay set aside.
      if (previous && !previous.body.trim()) {
        input.buffer.replace(null);
      }
      (decision === "highlight" ? input.highlight : input.showToolbar)(value);
    }
  };
  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  });
  // Listen from the start: only the composer path needs the stored draft, and selections made
  // while it loads from device storage would otherwise be dropped.
  useEffect(() => {
    if (!key) {
      return undefined;
    }
    return subscribeToSelections(sourceId, surface, ({ value }) => routeRef.current(value));
  }, [key, sourceId, surface]);
}

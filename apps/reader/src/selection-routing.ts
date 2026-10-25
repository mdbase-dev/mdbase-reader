import type { ComposerSelection } from "./annotation-composer-request.js";
import type { AnnotationLocalDraft } from "./annotation-drafts.js";

/**
 * What a new selection does. Selecting text offers actions (or highlights at once, when the
 * reader chose that); an area capture opens the composer; and a comment written for another
 * capture is never replaced without asking.
 */
export type SelectionRoute = "ignore" | "compose" | "confirm-compose" | "highlight" | "toolbar";

export function selectionRoute(input: {
  readonly value: ComposerSelection;
  readonly draft: AnnotationLocalDraft | null;
  /** The composer's draft is being saved. */
  readonly busy: boolean;
  readonly instant: boolean;
}): SelectionRoute {
  const { value, draft } = input;
  if (sameSelection(draft?.selection, value)) {
    return "ignore";
  }
  if (value.kind === "area") {
    if (input.busy) {
      return "ignore";
    }
    return draft?.body.trim() ? "confirm-compose" : "compose";
  }
  // Keyboard selections grow key by key and touch selections by their handles, so neither is
  // final when it is reported.
  const growing = value.value.via === "keyboard" || value.value.via === "touch";
  return input.instant && !growing ? "highlight" : "toolbar";
}

/** Renderers report a selection again on key and pointer release; the same passage is not new. */
export function sameSelection(
  current: ComposerSelection | undefined,
  next: ComposerSelection,
): boolean {
  if (current?.kind === "text" && next.kind === "text") {
    return JSON.stringify(current.value.target) === JSON.stringify(next.value.target);
  }
  return current?.value === next.value;
}

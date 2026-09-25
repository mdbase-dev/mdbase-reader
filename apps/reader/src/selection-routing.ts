import type { ComposerSelection } from "./annotation-composer-request.js";
import type { AnnotationLocalDraft } from "./annotation-drafts.js";

/**
 * What a new selection does. Selecting text offers actions (or highlights at once, when the
 * reader chose that); an area capture opens the composer; and a comment being written is never
 * replaced silently.
 */
export type SelectionRoute =
  "ignore" | "offer-switch" | "compose" | "confirm-compose" | "highlight" | "toolbar";

export function selectionRoute(input: {
  readonly value: ComposerSelection;
  readonly draft: AnnotationLocalDraft | null;
  /** The draft is set aside (e.g. while an annotation is edited), so its composer is hidden. */
  readonly paused: boolean;
  readonly busy: boolean;
  readonly instant: boolean;
}): SelectionRoute {
  const { value, draft } = input;
  if (input.busy || sameSelection(draft?.selection, value)) {
    return "ignore";
  }
  const written = Boolean(draft?.body.trim());
  if (written && !input.paused) {
    return "offer-switch";
  }
  if (value.kind === "area") {
    return written ? "confirm-compose" : "compose";
  }
  return input.instant && value.value.via !== "keyboard" ? "highlight" : "toolbar";
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

import type { HighlightColorKey } from "@mdbase-reader/core";

/** What a highlight key does while a passage is selected. */
export type HighlightKeyAction =
  { readonly kind: "save"; readonly color: HighlightColorKey } | { readonly kind: "clear" } | null;

/**
 * 1, 2, 3… save the selection in the colour at that place (once a save may start), and Esc
 * lets it go. The panel and the page, whichever has focus, both act through this.
 */
export function highlightKeyAction(
  key: string,
  colors: readonly HighlightColorKey[],
  ready: boolean,
): HighlightKeyAction {
  const color = /^[1-9]$/u.test(key) ? colors[Number(key) - 1] : undefined;
  if (color && ready) {
    return { kind: "save", color };
  }
  return key === "Escape" ? { kind: "clear" } : null;
}

/**
 * Keyboard focus moves into the page once the reader clicks it, and the page's key events never
 * reach the application. Forward the keys an application shortcut can use.
 */
export function forwardApplicationShortcut(event: KeyboardEvent, host: Document): void {
  if (!(isApplicationShortcut(event) || isSelectionShortcut(event)) || !host.defaultView) {
    return;
  }
  const forwarded = new host.defaultView.KeyboardEvent("keydown", {
    key: event.key,
    code: event.code,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    repeat: event.repeat,
    bubbles: true,
    cancelable: true,
  });
  if (!host.dispatchEvent(forwarded)) {
    event.preventDefault();
  }
}

export function isApplicationShortcut(event: KeyboardEvent): boolean {
  if (event.isComposing) {
    return false;
  }
  if (event.key === "Escape" || event.key === "F6" || event.key === "/") {
    return true;
  }
  if (event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
    return true;
  }
  // Leave the page's own editing and clipboard keys alone.
  const key = event.key.toLocaleLowerCase();
  return (event.ctrlKey || event.metaKey) && !["a", "c", "x", "v", "z", "y"].includes(key);
}

/** Single-letter selection actions: H highlights and C comments while text is selected. */
export const selectionShortcutKeys = ["h", "c"] as const;

/**
 * Whether a key acts on the current text selection. Only unmodified H and C outside form fields,
 * and only while the event's document has a selection, so typing is never intercepted.
 */
export function isSelectionShortcut(event: KeyboardEvent): boolean {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return false;
  }
  if (!(selectionShortcutKeys as readonly string[]).includes(event.key.toLocaleLowerCase())) {
    return false;
  }
  // Frames have their own Element constructor, so test the shape rather than instanceof.
  const target = event.target as { closest?: (selector: string) => unknown } | null;
  if (
    target?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])")
  ) {
    return false;
  }
  const selection = event.view?.getSelection();
  return Boolean(selection && !selection.isCollapsed);
}

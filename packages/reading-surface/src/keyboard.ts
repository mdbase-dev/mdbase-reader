/**
 * Keyboard focus moves into the page once the reader clicks it, and the page's key events never
 * reach the application. Forward the keys an application shortcut can use.
 */
export function forwardApplicationShortcut(event: KeyboardEvent, host: Document): void {
  if (
    !(
      isApplicationShortcut(event) ||
      isSelectionShortcut(event) ||
      isClaimedShortcut(event, host)
    ) ||
    !host.defaultView
  ) {
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

/**
 * Keys the application wants from the page for a while, beyond the usual shortcuts: Undo while a
 * highlight just made can be undone, and 1 to 5 while a clicked highlight offers its colours.
 */
export type FrameShortcut = "undo" | "colors";

const frameShortcutClaims = new WeakMap<Document, Map<FrameShortcut, number>>();

/**
 * Asks pages shown in `host` to forward a shortcut too, until the returned release is called.
 * Claims add up, so two parts of the application can claim the same keys. Keys typed in the
 * page's own fields are never forwarded.
 */
export function claimFrameShortcut(host: Document, shortcut: FrameShortcut): () => void {
  const claims = frameShortcutClaims.get(host) ?? new Map<FrameShortcut, number>();
  frameShortcutClaims.set(host, claims);
  claims.set(shortcut, (claims.get(shortcut) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    const count = (claims.get(shortcut) ?? 1) - 1;
    if (count > 0) {
      claims.set(shortcut, count);
    } else {
      claims.delete(shortcut);
    }
  };
}

/** Whether a key claimed for `host` was pressed outside the page's fields. */
export function isClaimedShortcut(event: KeyboardEvent, host: Document): boolean {
  const claims = frameShortcutClaims.get(host);
  if (!claims?.size || event.isComposing || event.altKey || isEditableTarget(event.target)) {
    return false;
  }
  const key = event.key.toLocaleLowerCase();
  if (claims.has("undo") && key === "z" && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
    return true;
  }
  return (
    claims.has("colors") &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    ["1", "2", "3", "4", "5"].includes(key)
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  // Frames have their own Element constructor, so test the shape rather than instanceof.
  const element = target as { closest?: (selector: string) => unknown } | null;
  return Boolean(
    element?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])"),
  );
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

/**
 * Single-key selection actions while text is selected: H highlights in the last colour used, 1 to 5
 * highlight in a palette colour, and C comments.
 */
export const selectionShortcutKeys = ["h", "c", "1", "2", "3", "4", "5"] as const;

/**
 * Whether a key acts on the current text selection. Only unmodified H, C and 1 to 5 outside fields,
 * and only while the event's document has a selection, so typing is never intercepted.
 */
export function isSelectionShortcut(event: KeyboardEvent): boolean {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return false;
  }
  if (!(selectionShortcutKeys as readonly string[]).includes(event.key.toLocaleLowerCase())) {
    return false;
  }
  if (isEditableTarget(event.target)) {
    return false;
  }
  const selection = event.view?.getSelection();
  return Boolean(selection && !selection.isCollapsed);
}

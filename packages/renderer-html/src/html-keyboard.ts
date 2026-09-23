/**
 * Keyboard focus moves into the page once the reader clicks it, and the page's key events never
 * reach the application. Forward the keys an application shortcut can use.
 */
export function forwardApplicationShortcut(event: KeyboardEvent, host: Document): void {
  if (!isApplicationShortcut(event) || !host.defaultView) {
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

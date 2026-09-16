import type { EditorView } from "@codemirror/view";

/** A delayed mount focus must never steal a subsequent click or keystroke in another view. */
export function scheduleInitialEditorFocus(view: EditorView): () => void {
  const document = view.dom.ownerDocument;
  const initialFocus = document.activeElement;
  const events = ["focusin", "pointerdown", "keydown"] as const;
  const cancel = (): void => {
    globalThis.clearTimeout(timer);
    for (const event of events) {
      document.removeEventListener(event, cancel, true);
    }
  };
  const timer = globalThis.setTimeout(() => {
    cancel();
    if (document.activeElement === initialFocus) {
      view.focus();
    }
  }, 50);
  for (const event of events) {
    document.addEventListener(event, cancel, true);
  }
  return cancel;
}

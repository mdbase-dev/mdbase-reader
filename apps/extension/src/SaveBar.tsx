import { useEffect } from "react";

import { readerSourceUrl } from "./capture-model.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

/** Whether a save may start now: connected, titled, not busy and still on the page. */
export function saveReady(c: ExtensionCaptureController): boolean {
  return c.snapshot.status === "ready" && !c.busy && !c.navigated && Boolean(c.draft.title.trim());
}

/**
 * The page's one save action, above the tabs so it is there whichever tab is open. Once
 * the page is saved it becomes the way into Reader, unless a passage is waiting to be saved.
 */
export function SaveBar({
  controller: c,
}: {
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element | null {
  const canSubmit = !c.source || c.draft.highlight;
  const ready = saveReady(c);
  const { save } = c;
  useEffect(() => {
    // Ctrl/⌘+Enter saves from any field of the capture draft, so a highlight never needs
    // the mouse. Fields that save something else (a saved note, a comment) handle it first.
    const onKeyDown = (event: KeyboardEvent): void => {
      const inside =
        event.target instanceof Element && event.target.closest("[data-capture-draft]");
      if (
        inside &&
        !event.defaultPrevented &&
        event.key === "Enter" &&
        (event.metaKey || event.ctrlKey) &&
        canSubmit &&
        ready
      ) {
        event.preventDefault();
        void save();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [canSubmit, ready, save]);
  if (!c.capture) {
    return null;
  }
  const pdf = c.capture.kind === "pdf";
  return (
    <div className="save-bar">
      {canSubmit ? (
        <>
          <button
            className="primary"
            type="button"
            disabled={!ready}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            onClick={() => void save()}
          >
            {submitLabel(c)}
          </button>
          <p className="shortcut-hint">
            {c.source || c.draft.title.trim() ? (
              <>
                or press <kbd>{modifierKey()}</kbd>+<kbd>Enter</kbd>
              </>
            ) : (
              "Give the source a title under Literature note to save it."
            )}
          </p>
        </>
      ) : null}
      {c.source ? (
        <p className="saved-line">
          <span>{c.status === "existing" ? "Already in this collection." : "Saved."}</span>
          {/* A PDF's highlighting happens in Reader, so that is the next step, not an aside. */}
          <a
            className={pdf && !canSubmit ? "primary reader-link" : "reader-link"}
            href={readerSourceUrl(c.source)}
            target="_blank"
            rel="noreferrer"
          >
            {pdf ? "Open in Reader to highlight" : "Open saved copy in Reader"}
          </a>
        </p>
      ) : null}
    </div>
  );
}

/** ⌘ on Apple keyboards; the shortcut accepts either key everywhere. */
function modifierKey(): string {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/u.test(navigator.userAgent)
    ? "⌘"
    : "Ctrl";
}

function submitLabel(c: ExtensionCaptureController): string {
  if (c.busy) {
    return c.status === "saving" || c.progress ? "Saving…" : "Please wait…";
  }
  const document = c.capture?.kind === "pdf" ? "PDF" : "source";
  if (!c.draft.highlight) {
    return `Save ${document}`;
  }
  return c.source ? "Save highlight" : `Save ${document} and highlight`;
}

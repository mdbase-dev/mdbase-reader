import { useEffect } from "react";

import { readerSourceUrl } from "./capture-model.js";
import { connectionUnavailableMessage } from "./connection-status.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

/** Whether a save may start now: connected, titled, not busy and still on the page. */
export function saveReady(c: ExtensionCaptureController): boolean {
  return c.snapshot.status === "ready" && !c.busy && !c.navigated && Boolean(c.draft.title.trim());
}

/**
 * Why saving is unavailable, when the reader can do something about it. Busy and navigated
 * states say so elsewhere (the status line and the moved-page notice).
 */
export function saveBlocker(c: ExtensionCaptureController): string | null {
  if (c.busy || c.navigated) {
    return null;
  }
  if (c.snapshot.status !== "ready") {
    // While Connect starts or checks setup there is nothing for the reader to do yet.
    return ["not_started", "starting", "checking_setup", "destroyed"].includes(c.snapshot.status)
      ? null
      : connectionUnavailableMessage(c.snapshot);
  }
  return c.draft.title.trim() ? null : "Give the source a title under Note to save it.";
}

/**
 * Saving the page itself, above the tabs so it is there whichever tab is open; a selected
 * passage is saved by choosing its colour instead. Once saved, the way into Reader.
 */
export function SaveBar({
  controller: c,
}: {
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element | null {
  const ready = saveReady(c);
  const blocker = saveBlocker(c);
  const selection = c.capture?.kind === "html" ? c.capture.selection : null;
  const { save, source } = c;
  useEffect(() => {
    // Ctrl/⌘+Enter from any field of the capture draft saves what that draft is for: the
    // selected passage in its chosen colour, or else the unsaved page. Fields that save
    // something else (a saved note, a comment being edited) handle it first.
    const onKeyDown = (event: KeyboardEvent): void => {
      const inside =
        event.target instanceof Element && event.target.closest("[data-capture-draft]");
      if (
        !inside ||
        event.defaultPrevented ||
        event.key !== "Enter" ||
        !(event.metaKey || event.ctrlKey) ||
        !ready
      ) {
        return;
      }
      if (selection) {
        event.preventDefault();
        void save({ highlight: true });
      } else if (!source) {
        event.preventDefault();
        void save({ highlight: false });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [ready, save, selection, source]);
  if (!c.capture) {
    return null;
  }
  const pdf = c.capture.kind === "pdf";
  if (source) {
    // A PDF's highlighting happens in Reader, so that is the next step, not an aside.
    return pdf ? (
      <a
        className="primary reader-link save-bar"
        href={readerSourceUrl(source)}
        target="_blank"
        rel="noreferrer"
      >
        Open in Reader to highlight
      </a>
    ) : (
      <p className="saved-line">
        {c.status === "existing" ? "In this collection" : "Saved"} ·{" "}
        <a href={readerSourceUrl(source)} target="_blank" rel="noreferrer">
          Open in Reader
        </a>
      </p>
    );
  }
  return (
    <div className="save-bar">
      <button
        // While a passage is selected its colours are the main action; this saves only the page.
        className={selection ? "secondary" : "primary"}
        type="button"
        disabled={!ready}
        aria-keyshortcuts={selection ? undefined : "Control+Enter Meta+Enter"}
        title={selection ? undefined : `Save (${modifierKey()}+Enter)`}
        onClick={() => void save({ highlight: false })}
      >
        {submitLabel(c)}
      </button>
      {blocker && !selection ? <p className="hint">{blocker}</p> : null}
    </div>
  );
}

/** ⌘ on Apple keyboards; the shortcut accepts either key everywhere. */
export function modifierKey(): string {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/u.test(navigator.userAgent)
    ? "⌘"
    : "Ctrl";
}

function submitLabel(c: ExtensionCaptureController): string {
  if (c.busy) {
    return c.status === "saving" || c.progress ? "Saving…" : "Please wait…";
  }
  return c.capture?.kind === "pdf" ? "Save PDF" : "Save page";
}

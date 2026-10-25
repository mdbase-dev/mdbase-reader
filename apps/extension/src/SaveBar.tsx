import { useEffect } from "react";

import { readerSourceUrl } from "./capture-model.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

/** Whether a save may start now: connected, titled, not busy and still on the page. */
export function saveReady(c: ExtensionCaptureController): boolean {
  return c.snapshot.status === "ready" && !c.busy && !c.navigated && Boolean(c.draft.title.trim());
}

/**
 * Why saving is unavailable, when the reader can do something about it. Busy and navigated
 * states say so elsewhere (the status line and the moved-page notice), and an unconnected
 * panel offers no Save at all (see `awaitingConnection`).
 */
export function saveBlocker(c: ExtensionCaptureController): string | null {
  if (c.busy || c.navigated || c.snapshot.status !== "ready") {
    return null;
  }
  return c.draft.title.trim() ? null : "Give the source a title under Literature note to save it.";
}

/**
 * Not connected to a collection that can be saved into, and not just starting: the
 * connection controls hold the one action, so nothing else offers a form or a Save.
 */
export function awaitingConnection(c: Pick<ExtensionCaptureController, "snapshot">): boolean {
  return c.snapshot.status !== "ready" && c.snapshot.status !== "opening";
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
  if (!c.capture || (!source && awaitingConnection(c))) {
    return null;
  }
  const pdf = c.capture.kind === "pdf";
  if (source) {
    // A PDF's highlighting happens in Reader, so that is the next step, not an aside. A
    // saved page's link sits in the status line instead.
    return pdf ? (
      <a
        className="primary reader-link save-bar"
        href={readerSourceUrl(source)}
        target="_blank"
        rel="noreferrer"
      >
        Open in Reader to highlight
      </a>
    ) : null;
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
  return c.capture?.kind === "pdf"
    ? "Save PDF"
    : c.postPicker
      ? "Choose posts to save"
      : c.capture?.kind === "html" && c.capture.post
        ? "Save post"
        : "Save page";
}

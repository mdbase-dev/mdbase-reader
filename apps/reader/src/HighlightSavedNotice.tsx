import { claimFrameShortcut, type ViewportRect } from "@mdbase-reader/reading-surface";
import { useEffect, useLayoutEffect, useRef, useState, type JSX } from "react";

import { CheckIcon, CloseIcon } from "./icons.js";

import type { SavedHighlight } from "./use-highlight-undo.js";

/** How long Undo stays offered while the pointer and focus are elsewhere. */
export const highlightUndoMilliseconds = 6000;

/** A taller passage spans lines, where a single sweep would tint text that was not selected. */
const sweepMaxHeight = 40;

function reducedMotion(): boolean {
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null;
  return Boolean(element?.closest?.("input, textarea, select, [contenteditable='true']"));
}

/** A dialog or menu open over the reader, which Esc should close instead. */
const openOverlays = "dialog[open], [aria-modal='true'], .library-row-menu";

interface LayerBox {
  readonly x: number;
  readonly y: number;
}

/**
 * The new highlight's ink sweeping across its passage, the only confirmation drawn on the page.
 * It tints the passage itself and covers nothing else. With reduced motion there is none.
 */
export function HighlightSweep({ saved }: { readonly saved: SavedHighlight | null }): JSX.Element {
  const layer = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState<LayerBox | null>(null);
  const id = saved?.id;
  useLayoutEffect(() => {
    const bounds = id === undefined ? undefined : layer.current?.getBoundingClientRect();
    setOrigin(bounds ? { x: bounds.left, y: bounds.top } : null);
  }, [id]);
  const rect = origin && saved?.rect ? relative(saved.rect, origin) : null;
  return (
    <div
      ref={layer}
      className="highlight-sweep-layer"
      aria-hidden="true"
      {...(saved ? { "data-highlight-color": saved.color } : {})}
    >
      {saved && rect && rect.height <= sweepMaxHeight && !reducedMotion() ? (
        <span
          key={saved.id}
          className="highlight-sweep"
          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        />
      ) : null}
    </div>
  );
}

/**
 * "Highlight saved · Undo" as a snackbar at the foot of the document, clear of the page's text.
 * It stays a few seconds, longer while pointed at or focused, and goes at once with × or Esc.
 * Ctrl+Z or ⌘Z outside a text field undoes the highlight while it is offered. Once the highlight
 * is being edited, Undo is withdrawn and the notice goes.
 *
 * `overlaid` says a selection toolbar or the composer is open: Esc is theirs to close, not the
 * notice's, as it is while a dialog or menu is open.
 */
export function HighlightSavedNotice({
  saved: tracked,
  overlaid = false,
  onUndo,
  onDismiss,
}: {
  readonly saved: SavedHighlight | null;
  readonly overlaid?: boolean;
  readonly onUndo: () => void;
  readonly onDismiss: () => void;
}): JSX.Element | null {
  const saved = tracked?.undoable ? tracked : null;
  // Held by its id, so a notice that goes while held does not leave the next one held.
  const [heldId, setHeldId] = useState<number | null>(null);
  const held = saved !== null && heldId === saved.id;
  useNoticeLifetime(saved?.status, held, overlaid, onUndo, onDismiss);
  if (!saved) {
    return null;
  }
  return (
    <>
      {/* Present, and empty, while saving, so the message that fills it is announced. */}
      <span role="status" className="sr-only">
        {savedMessage(saved)}
      </span>
      {saved.status === "saving" ? null : (
        <div
          className="highlight-saved"
          data-highlight-color={saved.color}
          onPointerEnter={() => setHeldId(saved.id)}
          onPointerLeave={() => setHeldId(null)}
          onFocus={() => setHeldId(saved.id)}
          onBlur={() => setHeldId(null)}
        >
          <SavedStatus saved={saved} onUndo={onUndo} />
          <button
            type="button"
            className="highlight-saved-dismiss"
            aria-label="Dismiss"
            aria-keyshortcuts="Escape"
            title="Dismiss (Esc)"
            onClick={onDismiss}
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </>
  );
}

function savedMessage(saved: SavedHighlight): string {
  switch (saved.status) {
    case "saving":
      return "";
    case "saved":
      return "Highlight saved";
    case "undoing":
      return "Removing…";
    case "embedded":
      return "Couldn’t undo: a note embeds this highlight.";
    case "failed":
      return `Couldn’t undo: ${saved.problem ?? "Reader could not delete this highlight."}`;
  }
}

function SavedStatus({
  saved,
  onUndo,
}: {
  readonly saved: SavedHighlight;
  readonly onUndo: () => void;
}): JSX.Element {
  // The live region above speaks the message; this copy is for the eye.
  if (saved.status === "embedded" || saved.status === "failed") {
    return (
      <span className="highlight-saved-message" aria-hidden="true">
        {savedMessage(saved)}
      </span>
    );
  }
  return (
    <>
      <span className="highlight-saved-message" aria-hidden="true">
        <span className="highlight-saved-check">
          <CheckIcon />
        </span>
        {savedMessage(saved)}
      </span>
      <button
        type="button"
        className="highlight-saved-undo"
        disabled={saved.status === "undoing"}
        aria-keyshortcuts="Control+Z Meta+Z"
        title="Undo highlight (Ctrl+Z)"
        onClick={onUndo}
      >
        Undo
      </button>
    </>
  );
}

/**
 * The notice goes after a while unless held, or at once on Esc; Ctrl+Z or ⌘Z undoes while it
 * is offered.
 */
function useNoticeLifetime(
  status: SavedHighlight["status"] | undefined,
  held: boolean,
  overlaid: boolean,
  onUndo: () => void,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (status === undefined || status === "saving" || status === "undoing" || held) {
      return undefined;
    }
    const timer = setTimeout(onDismiss, highlightUndoMilliseconds);
    return () => clearTimeout(timer);
  }, [status, held, onDismiss]);
  useEffect(() => {
    if (status === undefined || status === "saving" || overlaid) {
      return undefined;
    }
    // Esc closes the notice only when nothing else is open to take it: one press, one thing.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !isTyping(event.target) &&
        !document.querySelector(openOverlays)
      ) {
        onDismiss();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [status, overlaid, onDismiss]);
  useEffect(() => {
    if (status !== "saved") {
      return undefined;
    }
    // Focus is usually still in the page just highlighted, so ask it to pass Undo on.
    const release = claimFrameShortcut(document, "undo");
    const onKeyDown = (event: KeyboardEvent): void => {
      const undoKey =
        event.key.toLocaleLowerCase() === "z" &&
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey;
      if (undoKey && !event.defaultPrevented && !isTyping(event.target)) {
        event.preventDefault();
        onUndo();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      release();
    };
  }, [status, onUndo]);
}

function relative(rect: ViewportRect, origin: LayerBox): ViewportRect {
  return { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height };
}

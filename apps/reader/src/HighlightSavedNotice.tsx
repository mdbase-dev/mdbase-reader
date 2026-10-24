import { claimFrameShortcut, type ViewportRect } from "@mdbase-reader/reading-surface";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type JSX } from "react";

import { CheckIcon } from "./icons.js";

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

interface LayerBox {
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

/**
 * Confirms a quick highlight: its ink sweeps across the passage, then "Highlight saved · Undo"
 * stays for a few seconds, longer while pointed at or focused. Ctrl+Z or ⌘Z outside a text
 * field undoes it too. With reduced motion there is no sweep, but Undo is the same.
 */
export function HighlightSavedNotice({
  saved,
  onUndo,
  onDismiss,
}: {
  readonly saved: SavedHighlight | null;
  readonly onUndo: () => void;
  readonly onDismiss: () => void;
}): JSX.Element | null {
  const layer = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState<LayerBox | null>(null);
  const [held, setHeld] = useState(false);
  const id = saved?.id;
  useLayoutEffect(() => {
    const bounds = id === undefined ? undefined : layer.current?.getBoundingClientRect();
    setOrigin(bounds ? { x: bounds.left, y: bounds.top, height: bounds.height } : null);
  }, [id]);
  useNoticeLifetime(saved?.status, held, onUndo, onDismiss);
  if (!saved) {
    return null;
  }
  const rect = origin && saved.rect ? relative(saved.rect, origin) : null;
  return (
    <div ref={layer} className="highlight-saved-layer" data-highlight-color={saved.color}>
      {rect && rect.height <= sweepMaxHeight && !reducedMotion() ? (
        <span
          key={saved.id}
          className="highlight-sweep"
          aria-hidden="true"
          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        />
      ) : null}
      {/* Present, and empty, while saving, so the message that fills it is announced. */}
      <span role="status" className="sr-only">
        {savedMessage(saved)}
      </span>
      {saved.status === "saving" ? null : (
        <div
          className={`highlight-saved${rect ? " is-anchored" : ""}`}
          style={rect && origin ? noticePosition(rect, origin.height) : undefined}
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
        >
          <SavedStatus saved={saved} onUndo={onUndo} />
        </div>
      )}
    </div>
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
  const message = (
    <span className="highlight-saved-message" aria-hidden="true">
      {savedMessage(saved)}
    </span>
  );
  if (saved.status === "embedded" || saved.status === "failed") {
    return message;
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

/** The notice goes after a while unless held; Ctrl+Z or ⌘Z undoes while it is offered. */
function useNoticeLifetime(
  status: SavedHighlight["status"] | undefined,
  held: boolean,
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

/** Just below the passage, or above it when that would leave the document. */
function noticePosition(rect: ViewportRect, layerHeight: number): CSSProperties {
  const below = rect.y + rect.height + 8;
  return {
    left: Math.max(8, rect.x),
    top: below + 40 > layerHeight ? Math.max(8, rect.y - 40) : below,
  };
}

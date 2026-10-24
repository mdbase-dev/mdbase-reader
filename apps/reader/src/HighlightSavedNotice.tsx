import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type JSX } from "react";

import { CheckIcon } from "./icons.js";

import type { SavedHighlight } from "./use-highlight-undo.js";
import type { ViewportRect } from "@mdbase-reader/reading-surface";

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
      {saved.status === "saving" ? null : (
        <div
          className={`highlight-saved${rect ? " is-anchored" : ""}`}
          style={rect && origin ? noticePosition(rect, origin.height) : undefined}
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
        >
          <SavedStatus status={saved.status} onUndo={onUndo} />
        </div>
      )}
    </div>
  );
}

function SavedStatus({
  status,
  onUndo,
}: {
  readonly status: Exclude<SavedHighlight["status"], "saving">;
  readonly onUndo: () => void;
}): JSX.Element {
  if (status === "failed") {
    return <span role="status">Couldn’t undo: a note embeds this highlight.</span>;
  }
  return (
    <>
      <span role="status">
        <span className="highlight-saved-check" aria-hidden="true">
          <CheckIcon />
        </span>
        {status === "undoing" ? "Removing…" : "Highlight saved"}
      </span>
      <button
        type="button"
        disabled={status === "undoing"}
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
    if ((status !== "saved" && status !== "failed") || held) {
      return undefined;
    }
    const timer = setTimeout(onDismiss, highlightUndoMilliseconds);
    return () => clearTimeout(timer);
  }, [status, held, onDismiss]);
  useEffect(() => {
    if (status !== "saved") {
      return undefined;
    }
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
    return () => document.removeEventListener("keydown", onKeyDown);
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

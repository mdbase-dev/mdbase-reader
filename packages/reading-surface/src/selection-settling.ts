import type { Unsubscribe } from "./events.js";

const settleMs = 350;

/**
 * Calls back once a document's selection stops changing. Phones never release a pointer after a
 * long-press selection, and their selection handles send no pointer events at all, so
 * `selectionchange` is the only sign the reader selected something. A mouse drag in progress is
 * not settled, however long it pauses.
 */
export function watchSettledSelection(document: Document, onSettled: () => void): Unsubscribe {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dragging = false;
  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const onSelectionChange = (): void => {
    cancel();
    if (!dragging) {
      timer = setTimeout(() => {
        timer = null;
        onSettled();
      }, settleMs);
    }
  };
  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== "touch") {
      dragging = true;
      cancel();
    }
  };
  const onPointerEnd = (): void => {
    dragging = false;
  };
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointerup", onPointerEnd, true);
  document.addEventListener("pointercancel", onPointerEnd, true);
  return () => {
    cancel();
    document.removeEventListener("selectionchange", onSelectionChange);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("pointerup", onPointerEnd, true);
    document.removeEventListener("pointercancel", onPointerEnd, true);
  };
}

/** Identifies a selected range, so a selection reported on release is not reported again. */
export function selectionRangeKey(selection: Selection | null): string | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const start = `${nodePath(range.startContainer)}:${String(range.startOffset)}`;
  return `${start}-${nodePath(range.endContainer)}:${String(range.endOffset)}`;
}

function nodePath(node: Node): string {
  const path: number[] = [];
  for (let current = node, parent = node.parentNode; parent; parent = parent.parentNode) {
    path.push(Array.prototype.indexOf.call(parent.childNodes, current));
    current = parent;
  }
  return path.reverse().join(".");
}

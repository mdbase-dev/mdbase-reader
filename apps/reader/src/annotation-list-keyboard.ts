import type { KeyboardEvent } from "react";

const controlsSelector =
  "button:not(:disabled), summary, input:not(:disabled), textarea:not(:disabled), a[href]";
export function annotationItemControls(item: HTMLElement): HTMLElement[] {
  return [...item.querySelectorAll<HTMLElement>(controlsSelector)];
}

/** Logical neighbors, not DOM neighbors: pinned cards may be thousands of rows apart. */
export function annotationListKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  count: number,
  focusItem: (index: number, last?: boolean) => void,
  pause: () => void,
): void {
  const target = event.target as HTMLElement;
  if (target.closest('textarea, input, select, [contenteditable="true"], [role="menu"]')) {
    return;
  }
  if (["PageDown", "PageUp", " ", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    pause();
  }
  const item = target.closest<HTMLElement>('[role="listitem"][data-index]');
  if (!item) {
    return;
  }
  const index = Number(item.dataset["index"]);
  const next =
    arrowDestination(event.key, index, count) ?? tabDestination(event, target, item, index, count);
  if (next === null) {
    return;
  }
  event.preventDefault();
  focusItem(next, event.key === "Tab" && event.shiftKey);
}
function arrowDestination(key: string, index: number, count: number): number | null {
  switch (key) {
    case "ArrowDown":
      return Math.min(count - 1, index + 1);
    case "ArrowUp":
      return Math.max(0, index - 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
function tabDestination(
  event: KeyboardEvent,
  target: HTMLElement,
  item: HTMLElement,
  index: number,
  count: number,
): number | null {
  if (event.key !== "Tab") {
    return null;
  }
  if (event.shiftKey) {
    return target === item && index > 0 ? index - 1 : null;
  }
  return target === (annotationItemControls(item).at(-1) ?? item) && index + 1 < count
    ? index + 1
    : null;
}

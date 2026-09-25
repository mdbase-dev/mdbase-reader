import { useSyncExternalStore } from "react";

/** What selecting text does: offer actions, or highlight at once (for heavy highlighters). */
export type HighlightOnSelect = "offer" | "instant";

const storageKey = "mdbase-reader:highlight-on-select";
const listeners = new Set<() => void>();
// Private windows may refuse storage; the choice then lasts until the page reloads.
let unstored: HighlightOnSelect | null = null;

export function highlightOnSelect(): HighlightOnSelect {
  if (unstored) {
    return unstored;
  }
  try {
    return globalThis.localStorage.getItem(storageKey) === "instant" ? "instant" : "offer";
  } catch {
    return "offer";
  }
}

export function setHighlightOnSelect(value: HighlightOnSelect): void {
  try {
    globalThis.localStorage.setItem(storageKey, value);
    unstored = null;
  } catch {
    unstored = value;
  }
  listeners.forEach((listener) => listener());
}

export function useHighlightOnSelect(): HighlightOnSelect {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    highlightOnSelect,
    () => "offer",
  );
}

import { useCallback, useSyncExternalStore } from "react";

import type { ReadingSurface } from "@mdbase-reader/reading-surface";

/**
 * Where a finger drag scrolls a document rather than selecting (a PDF on a phone), selecting
 * text is a tool the reader turns on, like area capture. The surface owns the tool's state: it
 * returns to scrolling by itself once the selection it made is dismissed.
 */
export function useTextSelectionTool(surface: ReadingSurface | null): {
  readonly canSelectText: boolean;
  readonly selectingText: boolean;
  readonly toggleTextSelection: () => void;
} {
  const tool = surface?.capabilities.textSelection?.tool;
  const subscribe = useCallback(
    (listener: () => void) => tool?.changes.subscribe(listener) ?? (() => undefined),
    [tool],
  );
  const selectingText = useSyncExternalStore(subscribe, () => tool?.isActive() ?? false);
  return {
    canSelectText: Boolean(tool),
    selectingText,
    toggleTextSelection: () => {
      if (tool?.isActive()) {
        tool.cancel();
      } else {
        tool?.begin();
      }
    },
  };
}

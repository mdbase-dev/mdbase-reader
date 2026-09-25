import { useState } from "react";

import type { ReadingSurface } from "@mdbase-reader/reading-surface";

/** PDF area capture is an explicit mode the reader turns on for one capture. */
export function useAreaSelectionMode(surface: ReadingSurface | null): {
  readonly canSelectArea: boolean;
  readonly selectingArea: boolean;
  readonly toggleAreaSelection: () => void;
  readonly endAreaSelection: () => void;
} {
  const [areaSurface, setAreaSurface] = useState<ReadingSurface | null>(null);
  return {
    canSelectArea: Boolean(surface?.capabilities.areaSelection),
    selectingArea: areaSurface !== null && areaSurface === surface,
    endAreaSelection: () => setAreaSurface(null),
    toggleAreaSelection: () => {
      const capability = surface?.capabilities.areaSelection;
      if (!capability) {
        return;
      }
      if (areaSurface === surface) {
        capability.cancelAreaSelection();
        setAreaSurface(null);
      } else {
        capability.beginAreaSelection();
        setAreaSurface(surface);
      }
    },
  };
}

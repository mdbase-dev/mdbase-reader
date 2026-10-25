import { highlightColorKeys } from "@mdbase-reader/core";
import { useEffect, useState } from "react";

import type { ExtensionSession } from "./connect-session.js";
import type { HighlightColorKey, HighlightMeanings } from "@mdbase-reader/core";

/** The colours the panel offers for a new highlight, in order, and what each means. */
export interface PanelHighlightSettings {
  readonly colors: readonly HighlightColorKey[];
  readonly meanings: HighlightMeanings;
}

export const defaultPanelHighlightSettings: PanelHighlightSettings = {
  colors: highlightColorKeys,
  meanings: {},
};

/**
 * The connected collection's highlight colour settings, the same record Reader reads. The SDK
 * host's settings store follows the collection's change feed; the panel asks it again whenever
 * a new passage is selected and when the panel comes back into view, so an edit made in Reader
 * or on another device shows by the next highlight. Until an answer arrives, and for a host
 * without settings, all five colours are offered.
 */
export function useHighlightSettings(
  extension: ExtensionSession | null,
  /** Changes when the panel should ask again, such as the selected passage. */
  refresh: string | null,
): PanelHighlightSettings {
  const collection = extension?.connectedCollection() ?? null;
  const [loaded, setLoaded] = useState<{
    readonly collectionId: string;
    readonly settings: PanelHighlightSettings;
  } | null>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const again = (): void => {
      if (document.visibilityState === "visible") {
        setShown((count) => count + 1);
      }
    };
    globalThis.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      globalThis.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, []);
  useEffect(() => {
    const settings = collection?.settings;
    if (!collection || typeof settings?.highlightColors !== "function") {
      return;
    }
    let current = true;
    const { collectionId } = collection;
    void settings
      .highlightColors()
      .then(({ colors, meanings }) => {
        if (current && colors.length > 0) {
          setLoaded({ collectionId, settings: { colors, meanings } });
        }
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [collection, refresh, shown]);
  return loaded && loaded.collectionId === collection?.collectionId
    ? loaded.settings
    : defaultPanelHighlightSettings;
}

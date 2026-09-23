import { useEffect, useState } from "react";

import type { ReadingSurface, ViewportRect } from "@mdbase-reader/reading-surface";

const pointerFreshness = 1500;
let lastPointer: { readonly x: number; readonly y: number; readonly at: number } | null = null;
let tracking = false;

// EmbedPDF selects in the main document, so the release point locates its selections.
function trackPointer(): void {
  if (tracking || typeof window === "undefined") {
    return;
  }
  tracking = true;
  window.addEventListener(
    "pointerup",
    (event) => {
      lastPointer = { x: event.clientX, y: event.clientY, at: performance.now() };
    },
    { capture: true, passive: true },
  );
}

function recentPointerRect(): ViewportRect | null {
  return lastPointer && performance.now() - lastPointer.at < pointerFreshness
    ? { x: lastPointer.x, y: lastPointer.y, width: 0, height: 0 }
    : null;
}

/**
 * The on-screen position of the selection the reader has just made. It is kept
 * only for that live selection and forgotten once the document moves, so a
 * resumed draft or a scrolled page never anchors to a stale position.
 */
export function useSelectionAnchor(
  surface: ReadingSurface | null,
): { readonly draft: object; readonly rect: ViewportRect } | null {
  const [anchor, setAnchor] = useState<{
    readonly surface: ReadingSurface;
    readonly draft: object;
    readonly rect: ViewportRect;
  } | null>(null);
  useEffect(() => {
    trackPointer();
    if (!surface) {
      return undefined;
    }
    const remember = (draft: object, rect: ViewportRect | null | undefined): void =>
      setAnchor(rect ? { surface, draft, rect } : null);
    const text = surface.capabilities.textSelection?.selections.subscribe((draft) =>
      remember(draft, draft.anchor ?? recentPointerRect()),
    );
    const area = surface.capabilities.areaSelection?.selections.subscribe((draft) =>
      remember(draft, recentPointerRect()),
    );
    const moved = surface.locations.subscribe(() => setAnchor(null));
    return () => {
      text?.();
      area?.();
      moved();
    };
  }, [surface]);
  // An anchor belongs to the surface it came from; switching documents forgets it.
  return anchor?.surface === surface ? anchor : null;
}

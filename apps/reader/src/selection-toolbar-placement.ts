import type { ViewportRect } from "@mdbase-reader/reading-surface";
import type { CSSProperties } from "react";

const gap = 8;
const margin = 10;

/**
 * Places the toolbar just above the selection so the lines below stay readable, or below it when
 * there is no room. Returns null to dock it: on phones, where the system's own selection menu sits
 * beside the text, and when the selection's position is unknown or fills the view.
 */
export function selectionToolbarPlacement(
  layer: Pick<DOMRect, "left" | "top" | "width" | "height">,
  anchor: ViewportRect | null,
  size: { readonly width: number; readonly height: number },
): CSSProperties | null {
  if (!anchor || layer.width < 520) {
    return null;
  }
  const centre = anchor.x + anchor.width / 2 - layer.left;
  const left = Math.min(
    Math.max(centre - size.width / 2, margin),
    Math.max(margin, layer.width - size.width - margin),
  );
  const above = anchor.y - layer.top - gap - size.height;
  const below = anchor.y + anchor.height - layer.top + gap;
  if (above >= margin) {
    return { left, top: above };
  }
  return below + size.height <= layer.height - margin ? { left, top: below } : null;
}

import type { ViewportRect } from "@mdbase-reader/reading-surface";
import type { CSSProperties } from "react";

const gap = 8;
const margin = 10;

/**
 * Places the toolbar clear of the passage, which renderers report as one rectangle around all of
 * its lines. It goes just above, so the lines below stay readable; below when there is no room
 * above; and beside a passage too tall for either. It is always kept inside the layer.
 *
 * Returns null to dock it: on phones, where the system's own selection menu sits beside the text,
 * and when the passage's position is unknown or leaves no room anywhere around it.
 */
export function selectionToolbarPlacement(
  layer: Pick<DOMRect, "left" | "top" | "width" | "height">,
  anchor: ViewportRect | null,
  size: { readonly width: number; readonly height: number },
): CSSProperties | null {
  if (!anchor || layer.width < 520) {
    return null;
  }
  const top = anchor.y - layer.top;
  const bottom = top + anchor.height;
  const start = anchor.x - layer.left;
  const end = start + anchor.width;
  const left = clamp(start + anchor.width / 2 - size.width / 2, layer.width - size.width);
  const above = top - gap - size.height;
  if (above >= margin) {
    return { left, top: above };
  }
  const below = bottom + gap;
  if (below + size.height <= layer.height - margin) {
    return { left, top: below };
  }
  // A passage taller than the room around it: beside its visible part, if either side has space.
  const beside = clamp(Math.max(top, 0), layer.height - size.height);
  if (end + gap + size.width <= layer.width - margin) {
    return { left: end + gap, top: beside };
  }
  if (start - gap - size.width >= margin) {
    return { left: start - gap - size.width, top: beside };
  }
  return null;
}

/** Keeps an offset at least `margin` from both edges, preferring the near edge when it cannot. */
function clamp(value: number, limit: number): number {
  return Math.min(Math.max(value, margin), Math.max(margin, limit - margin));
}

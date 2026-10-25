import { findPdfScroller } from "./pdf-touch-selection-view.js";

import type { Rect } from "@embedpdf/models";
import type { EmbedPdfContainer } from "@embedpdf/react-pdf-viewer";
import type { ViewportRect } from "@mdbase-reader/reading-surface";

/** A rectangle in a page's own coordinates, as selections and annotations report them. */
export interface PdfPageRect {
  readonly pageIndex: number;
  readonly rect: Rect;
}

/** Places a page rectangle inside the scroller's content box, at the current zoom. */
export type PlacePageRect = (pageIndex: number, rect: Rect) => Rect | null;

/** The smallest rectangle around all of `rects`, or null when there are none. */
export function unionViewportRect(rects: readonly ViewportRect[]): ViewportRect | null {
  if (rects.length === 0) {
    return null;
  }
  const left = Math.min(...rects.map(({ x }) => x));
  const top = Math.min(...rects.map(({ y }) => y));
  const right = Math.max(...rects.map(({ x, width }) => x + width));
  const bottom = Math.max(...rects.map(({ y, height }) => y + height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Where page rectangles sit on screen: placed in the scroller's content box, then offset by
 * where that box is in the window. Several lines or pages become one rectangle around them all,
 * so selection UI can keep clear of the whole passage.
 */
export function pageRectsToViewport(
  rects: readonly PdfPageRect[],
  place: PlacePageRect,
  origin: { readonly left: number; readonly top: number },
): ViewportRect | null {
  return unionViewportRect(
    rects.flatMap(({ pageIndex, rect }) => {
      const placed = place(pageIndex, rect);
      return placed
        ? [
            {
              x: origin.left + placed.origin.x,
              y: origin.top + placed.origin.y,
              width: placed.size.width,
              height: placed.size.height,
            },
          ]
        : [];
    }),
  );
}

/**
 * Measures page rectangles against the viewer's scroller. It fails closed, returning null, when
 * the viewer or its scroller cannot be found; callers then fall back to the pointer.
 */
export function createPdfViewportLocator(
  host: () => EmbedPdfContainer | null,
  place: PlacePageRect,
): (rects: readonly PdfPageRect[]) => ViewportRect | null {
  let scroller: HTMLElement | null = null;
  return (rects) => {
    const root = host()?.shadowRoot;
    if (!root) {
      return null;
    }
    if (!scroller?.isConnected || !root.contains(scroller)) {
      scroller = findPdfScroller(root);
    }
    if (!scroller) {
      return null;
    }
    return pageRectsToViewport(rects, place, scroller.getBoundingClientRect());
  };
}

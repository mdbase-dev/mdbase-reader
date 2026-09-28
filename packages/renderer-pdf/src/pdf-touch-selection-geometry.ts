import { restorePosition } from "@embedpdf/models";

import type { PdfPageGeometry, Position, Rect, Rotation, Size } from "@embedpdf/models";
import type { GlyphPointer, SelectionRangeX } from "@embedpdf/plugin-selection";

export function compareGlyphs(a: GlyphPointer, b: GlyphPointer): number {
  return a.page - b.page || a.index - b.index;
}

/** Keep the opposite endpoint fixed, even when the moving endpoint crosses it. */
export function rangeFromEndpoints(fixed: GlyphPointer, moving: GlyphPointer): SelectionRangeX {
  return compareGlyphs(fixed, moving) <= 0
    ? { start: fixed, end: moving }
    : { start: moving, end: fixed };
}

export function glyphRect(geometry: PdfPageGeometry | undefined, index: number): Rect | null {
  for (const run of geometry?.runs ?? []) {
    const glyph = run.glyphs[index - run.charStart];
    if (glyph && glyph.width > 0 && glyph.height > 0) {
      return {
        origin: { x: glyph.x, y: glyph.y },
        size: { width: glyph.width, height: glyph.height },
      };
    }
  }
  return null;
}

export function pagePoint(
  point: Position,
  page: Rect,
  rotation: Rotation,
  scale: number,
): Position {
  return restorePosition(
    page.size,
    { x: point.x - page.origin.x, y: point.y - page.origin.y },
    rotation,
    scale,
  );
}

/** A rate, not pixels per frame; scrolling should feel the same at 60Hz and 120Hz. */
export function edgeVelocity(position: number, size: number): number {
  const zone = Math.min(56, size / 4);
  if (position < zone) {
    return -600 * Math.min(1, (zone - position) / zone);
  }
  if (position > size - zone) {
    return 600 * Math.min(1, (position - size + zone) / zone);
  }
  return 0;
}

export function rectDistance(point: Position, rect: Rect): number {
  const dx = Math.max(rect.origin.x - point.x, 0, point.x - rect.origin.x - rect.size.width);
  const dy = Math.max(rect.origin.y - point.y, 0, point.y - rect.origin.y - rect.size.height);
  return Math.hypot(dx, dy);
}

export function fullPage(size: Size): Rect {
  return { origin: { x: 0, y: 0 }, size };
}

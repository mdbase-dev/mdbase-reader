import { describe, expect, it } from "vitest";

import { pageRectsToViewport, unionViewportRect } from "./pdf-viewport-rect.js";

import type { Rect } from "@embedpdf/models";

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  origin: { x, y },
  size: { width, height },
});

describe("PDF viewport rectangles", () => {
  it("surrounds every line of a selection, not just the one released on", () => {
    expect(
      unionViewportRect([
        { x: 120, y: 200, width: 300, height: 14 },
        { x: 100, y: 216, width: 340, height: 14 },
        { x: 100, y: 232, width: 80, height: 14 },
      ]),
    ).toEqual({ x: 100, y: 200, width: 340, height: 46 });
    expect(unionViewportRect([])).toBeNull();
  });

  it("places page rectangles at the current zoom and offsets them by the scroller", () => {
    // Page 1 starts 1000px down the scroller, and the viewer is zoomed to 2×.
    const place = (pageIndex: number, value: Rect): Rect =>
      rect(
        10 + value.origin.x * 2,
        pageIndex * 1000 + value.origin.y * 2,
        value.size.width * 2,
        value.size.height * 2,
      );
    expect(
      pageRectsToViewport(
        [
          { pageIndex: 0, rect: rect(50, 450, 100, 10) },
          { pageIndex: 1, rect: rect(50, 5, 60, 10) },
        ],
        place,
        { left: 40, top: -800 },
      ),
    ).toEqual({ x: 150, y: 100, width: 200, height: 130 });
  });

  it("skips pages the viewer has not laid out", () => {
    expect(
      pageRectsToViewport([{ pageIndex: 3, rect: rect(0, 0, 10, 10) }], () => null, {
        left: 0,
        top: 0,
      }),
    ).toBeNull();
  });
});

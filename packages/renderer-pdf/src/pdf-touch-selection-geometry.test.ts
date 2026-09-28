import { transformPosition, transformSize } from "@embedpdf/models";
import { describe, expect, it } from "vitest";

import {
  edgeVelocity,
  glyphRect,
  pagePoint,
  rangeFromEndpoints,
  rectDistance,
} from "./pdf-touch-selection-geometry.js";

describe("touch selection geometry", () => {
  it("keeps the fixed endpoint when crossing in either direction, including across pages", () => {
    const fixed = { page: 1, index: 20 };
    for (const moving of [
      { page: 0, index: 99 },
      { page: 1, index: 3 },
    ]) {
      expect(rangeFromEndpoints(fixed, moving)).toEqual({ start: moving, end: fixed });
    }
    for (const moving of [
      { page: 1, index: 40 },
      { page: 2, index: 0 },
    ]) {
      expect(rangeFromEndpoints(fixed, moving)).toEqual({ start: fixed, end: moving });
    }
    expect(rangeFromEndpoints(fixed, fixed)).toEqual({ start: fixed, end: fixed });
  });

  it.each([0, 1, 2, 3])(
    "round-trips client coordinates at rotation %i and different zoom levels",
    (angle) => {
      const rotation = angle;
      const size = { width: 360, height: 700 };
      const origin = { x: 75, y: 1320 };
      const point = { x: 123, y: 456 };
      for (const scale of [0.5, 1, 1.5, 3]) {
        const transformed = transformPosition(size, point, rotation, scale);
        expect(
          pagePoint(
            { x: origin.x + transformed.x, y: origin.y + transformed.y },
            { origin, size: transformSize(size, rotation, scale) },
            rotation,
            scale,
          ),
        ).toEqual(point);
      }
    },
  );

  it("finds an endpoint in a later text run and ignores missing or zero-sized glyphs", () => {
    const rect = { x: 10, y: 20, width: 8, height: 12 };
    const geometry = {
      runs: [
        {
          charStart: 40,
          rect,
          glyphs: [
            { ...rect, flags: 0 },
            { ...rect, width: 0, flags: 0 },
          ],
        },
      ],
    };
    expect(glyphRect(geometry, 40)).toEqual({
      origin: { x: 10, y: 20 },
      size: { width: 8, height: 12 },
    });
    expect(glyphRect(geometry, 39)).toBeNull();
    expect(glyphRect(geometry, 41)).toBeNull();
    expect(glyphRect(undefined, 0)).toBeNull();
  });

  it("scrolls only near edges, proportionally, with a capped speed", () => {
    expect(edgeVelocity(200, 400)).toBe(0);
    expect(edgeVelocity(28, 400)).toBe(-300);
    expect(edgeVelocity(372, 400)).toBe(300);
    expect(edgeVelocity(-30, 400)).toBe(-600);
    expect(edgeVelocity(430, 400)).toBe(600);
  });

  it("finds the closest page even when the finger is in a page gap", () => {
    const rect = { origin: { x: 10, y: 20 }, size: { width: 100, height: 200 } };
    expect(rectDistance({ x: 50, y: 50 }, rect)).toBe(0);
    expect(rectDistance({ x: 50, y: 225 }, rect)).toBe(5);
    expect(rectDistance({ x: 7, y: 16 }, rect)).toBe(5);
  });
});

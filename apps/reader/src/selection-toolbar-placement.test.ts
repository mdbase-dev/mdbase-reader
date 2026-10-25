import { describe, expect, it } from "vitest";

import { selectionToolbarPlacement } from "./selection-toolbar-placement.js";

import type { ViewportRect } from "@mdbase-reader/reading-surface";
import type { CSSProperties } from "react";

const layer = { left: 0, top: 0, width: 1000, height: 800 };
const size = { width: 300, height: 36 };

/** Whether the placed toolbar shares any area with the passage, in layer coordinates. */
function covers(style: CSSProperties | null, passage: ViewportRect, origin = layer): boolean {
  if (!style) {
    return false;
  }
  const left = Number(style.left);
  const top = Number(style.top);
  const x = passage.x - origin.left;
  const y = passage.y - origin.top;
  return (
    left < x + passage.width &&
    x < left + size.width &&
    top < y + passage.height &&
    y < top + size.height
  );
}

describe("selectionToolbarPlacement", () => {
  it("sits centred above the selection", () => {
    expect(
      selectionToolbarPlacement(layer, { x: 400, y: 300, width: 200, height: 20 }, size),
    ).toEqual({ left: 350, top: 256 });
  });

  it("drops below a selection at the top of the view", () => {
    expect(
      selectionToolbarPlacement(layer, { x: 400, y: 20, width: 200, height: 20 }, size),
    ).toEqual({ left: 350, top: 48 });
  });

  it("stays inside the layer near its edges", () => {
    expect(
      selectionToolbarPlacement(layer, { x: 980, y: 300, width: 10, height: 20 }, size)?.left,
    ).toBe(690);
  });

  it("docks on phones and without a known position", () => {
    expect(
      selectionToolbarPlacement(
        { ...layer, width: 390 },
        { x: 10, y: 300, width: 5, height: 5 },
        size,
      ),
    ).toBeNull();
    expect(selectionToolbarPlacement(layer, null, size)).toBeNull();
  });

  it("keeps clear of every line of a multi-line passage", () => {
    // Three lines from y 300 to 346: the toolbar sits above the first, not over the second.
    const passage = { x: 100, y: 300, width: 600, height: 46 };
    const style = selectionToolbarPlacement(layer, passage, size);
    expect(style).toEqual({ left: 250, top: 256 });
    expect(covers(style, passage)).toBe(false);
  });

  it("flips below when the passage starts near the top, and never covers it", () => {
    const passage = { x: 100, y: 30, width: 600, height: 120 };
    const style = selectionToolbarPlacement(layer, passage, size);
    expect(style).toEqual({ left: 250, top: 158 });
    expect(covers(style, passage)).toBe(false);
  });

  it("works in a layer offset within the window", () => {
    const offset = { left: 240, top: 90, width: 900, height: 700 };
    const passage = { x: 400, y: 300, width: 200, height: 40 };
    const style = selectionToolbarPlacement(offset, passage, size);
    expect(style).toEqual({ left: 110, top: 166 });
    expect(covers(style, passage, offset)).toBe(false);
  });

  it("goes beside a passage too tall for above or below", () => {
    const tall = { x: 100, y: 20, width: 400, height: 760 };
    const style = selectionToolbarPlacement(layer, tall, size);
    expect(style).toEqual({ left: 508, top: 20 });
    expect(covers(style, tall)).toBe(false);
    const right = { x: 500, y: 20, width: 480, height: 760 };
    expect(selectionToolbarPlacement(layer, right, size)).toEqual({ left: 192, top: 20 });
  });

  it("keeps the toolbar inside the layer beside a passage scrolled partly out of view", () => {
    const style = selectionToolbarPlacement(
      layer,
      { x: 100, y: -400, width: 400, height: 1300 },
      size,
    );
    expect(style).toEqual({ left: 508, top: 10 });
  });

  it("docks when nothing around the passage has room", () => {
    expect(
      selectionToolbarPlacement(layer, { x: 20, y: 20, width: 960, height: 760 }, size),
    ).toBeNull();
  });
});

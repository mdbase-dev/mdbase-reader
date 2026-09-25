import { describe, expect, it } from "vitest";

import { selectionToolbarPlacement } from "./selection-toolbar-placement.js";

const layer = { left: 0, top: 0, width: 1000, height: 800 };
const size = { width: 300, height: 36 };

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
});

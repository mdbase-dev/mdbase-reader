import { describe, expect, it } from "vitest";

import { listItemClick } from "./use-long-press.js";

const tap = {
  consumed: false,
  touched: true,
  touchSelecting: false,
  modified: false,
  keyboard: false,
};

describe("listItemClick", () => {
  it("opens an item on a finger's tap", () => {
    expect(listItemClick(tap)).toBe("open");
  });

  it("selects on a mouse click, leaving opening to a double-click", () => {
    expect(listItemClick({ ...tap, touched: false })).toBe("select");
  });

  it("toggles instead of opening while selecting by touch", () => {
    expect(listItemClick({ ...tap, touchSelecting: true })).toBe("select");
  });

  it("selects for modified clicks and keyboard activation", () => {
    expect(listItemClick({ ...tap, modified: true })).toBe("select");
    expect(listItemClick({ ...tap, keyboard: true })).toBe("select");
  });

  it("ignores the click that ends a long press", () => {
    expect(listItemClick({ ...tap, consumed: true })).toBe("ignore");
  });
});

import { describe, expect, it } from "vitest";

import { keyboardSourceIndex, virtualSourceRange } from "./virtual-source-list.js";

describe("virtualSourceRange", () => {
  it("renders the visible rows with a small overscan window", () => {
    expect(
      virtualSourceRange({
        itemCount: 1_483,
        scrollTop: 7_206,
        viewportHeight: 632,
      }),
    ).toEqual({
      start: 95,
      end: 114,
      offset: 6_846,
      totalHeight: 106_794,
    });
  });

  it("clamps the first and last windows to the collection", () => {
    expect(virtualSourceRange({ itemCount: 4, scrollTop: 0, viewportHeight: 100 })).toEqual({
      start: 0,
      end: 4,
      offset: 6,
      totalHeight: 306,
    });
  });
});

describe("keyboardSourceIndex", () => {
  it("supports listbox navigation without leaving the source range", () => {
    expect(keyboardSourceIndex("ArrowDown", 0, 3)).toBe(1);
    expect(keyboardSourceIndex("ArrowUp", 0, 3)).toBe(0);
    expect(keyboardSourceIndex("End", 0, 3)).toBe(2);
    expect(keyboardSourceIndex("Home", 2, 3)).toBe(0);
    expect(keyboardSourceIndex("Enter", 1, 3)).toBeNull();
  });
});

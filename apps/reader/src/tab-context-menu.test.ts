import { describe, expect, it } from "vitest";

import { tabContextMenuPosition } from "./tab-context-menu.js";

describe("tab context menu positioning", () => {
  it("opens below a click in the upper half of the viewport", () => {
    expect(tabContextMenuPosition(180, 220, 900)).toEqual({
      x: 180,
      y: 220,
      opensUpward: false,
    });
  });

  it("opens above a click in the lower half of the viewport", () => {
    expect(tabContextMenuPosition(960, 760, 900)).toEqual({
      x: 960,
      y: 760,
      opensUpward: true,
    });
  });
});

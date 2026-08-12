import { describe, expect, it } from "vitest";

import { tabDestination } from "./source-tab-keyboard.js";

describe("source tab keyboard navigation", () => {
  it("wraps through tabs with horizontal arrow keys", () => {
    expect(tabDestination("ArrowRight", 2, 3)).toBe(0);
    expect(tabDestination("ArrowLeft", 0, 3)).toBe(2);
  });

  it("supports first and last tab shortcuts", () => {
    expect(tabDestination("Home", 1, 3)).toBe(0);
    expect(tabDestination("End", 1, 3)).toBe(2);
    expect(tabDestination("Enter", 1, 3)).toBeNull();
  });
});

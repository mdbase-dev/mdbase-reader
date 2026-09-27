import { describe, expect, it } from "vitest";

import { revealOffset } from "./keep-focused-field-in-view.js";

const scroller = { top: 100, bottom: 900 };

describe("revealOffset", () => {
  it("leaves a field that is already visible alone", () => {
    expect(revealOffset({ top: 300, bottom: 400 }, scroller, 900)).toBe(0);
  });

  it("scrolls a field above the keyboard", () => {
    // The keyboard's top is at 500; the field sits beneath it.
    expect(revealOffset({ top: 507, bottom: 603 }, scroller, 500)).toBe(603 - 500 + 12);
  });

  it("shows the top of a field taller than the room", () => {
    expect(revealOffset({ top: 450, bottom: 1200 }, scroller, 500)).toBe(450 - 100 - 12);
  });

  it("scrolls back to a field above the scroller's top", () => {
    expect(revealOffset({ top: 40, bottom: 120 }, scroller, 900)).toBe(40 - 100 - 12);
  });
});

import { describe, expect, it } from "vitest";

import { highlightKeyAction } from "./highlight-keys.js";

describe("highlight keys", () => {
  const colors = ["yellow", "green", "blue"] as const;

  it("saves in the colour at the digit's place once a save may start", () => {
    expect(highlightKeyAction("1", colors, true)).toEqual({ kind: "save", color: "yellow" });
    expect(highlightKeyAction("3", colors, true)).toEqual({ kind: "save", color: "blue" });
    expect(highlightKeyAction("3", colors, false)).toBeNull();
  });

  it("ignores digits beyond the colours and other keys, and clears on Esc", () => {
    expect(highlightKeyAction("4", colors, true)).toBeNull();
    expect(highlightKeyAction("0", colors, true)).toBeNull();
    expect(highlightKeyAction(" ", colors, true)).toBeNull();
    expect(highlightKeyAction("a", colors, true)).toBeNull();
    expect(highlightKeyAction("Escape", colors, false)).toEqual({ kind: "clear" });
  });
});

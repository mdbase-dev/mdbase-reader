import { describe, expect, it } from "vitest";

import { markdownEdit } from "./markdown-commands.js";

describe("markdownEdit", () => {
  it("wraps and unwraps selected emphasis", () => {
    expect(markdownEdit("read this", 5, 9, "strong")).toMatchObject({
      from: 5,
      to: 9,
      insert: "**this**",
      anchor: 7,
      head: 11,
    });
    expect(markdownEdit("**this**", 0, 8, "strong")).toMatchObject({
      insert: "this",
      anchor: 0,
      head: 4,
    });
  });

  it("creates a link and selects its destination", () => {
    expect(markdownEdit("Attention", 0, 9, "link")).toEqual({
      from: 0,
      to: 9,
      insert: "[Attention](url)",
      anchor: 12,
      head: 15,
    });
  });

  it("toggles block prefixes across selected lines", () => {
    expect(markdownEdit("First\nSecond", 0, 12, "quote").insert).toBe("> First\n> Second");
    expect(markdownEdit("> First\n> Second", 0, 16, "quote").insert).toBe("First\nSecond");
  });
});

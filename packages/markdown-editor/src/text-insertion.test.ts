import { describe, expect, it } from "vitest";

import { textInsertionAtCursor } from "./text-insertion.js";

const citation = { requestId: 1, text: "[@weil1952]", wordBounded: true } as const;

describe("textInsertionAtCursor", () => {
  it("separates a citation inserted between words", () => {
    expect(textInsertionAtCursor("CompareMurdoch", 7, citation)).toEqual({
      from: 7,
      insert: " [@weil1952] ",
      cursor: 20,
    });
  });

  it("keeps terminal punctuation immediately after a citation", () => {
    expect(textInsertionAtCursor("Compare.", 7, citation)).toEqual({
      from: 7,
      insert: " [@weil1952]",
      cursor: 19,
    });
  });

  it("does not add spaces at an empty line", () => {
    expect(textInsertionAtCursor("First\n\n", 7, citation)).toEqual({
      from: 7,
      insert: "[@weil1952]",
      cursor: 18,
    });
  });
});

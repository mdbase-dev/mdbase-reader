import { describe, expect, it } from "vitest";

import { editableText, parseFieldInput } from "./library-field-edit.js";

describe("field editing", () => {
  it("keeps the field's kind", () => {
    expect(parseFieldInput("a, b ,", ["x"], "scalar")).toEqual(["a", "b"]);
    expect(parseFieldInput("3", 2, "scalar")).toBe(3);
    expect(parseFieldInput("three", 2, "scalar")).toBe("three");
    expect(parseFieldInput("No", true, "scalar")).toBe(false);
    expect(parseFieldInput("draft", undefined, "list")).toEqual(["draft"]);
    expect(parseFieldInput("[[courses/a|A]]", "x", "scalar")).toBe("[[courses/a|A]]");
  });

  it("removes a field when emptied", () => {
    expect(parseFieldInput("  ", "x", "scalar")).toBeNull();
  });

  it("starts from readable text", () => {
    expect(editableText(["a", "[[b]]"])).toBe("a, [[b]]");
    expect(editableText(4)).toBe("4");
    expect(editableText(undefined)).toBe("");
  });
});

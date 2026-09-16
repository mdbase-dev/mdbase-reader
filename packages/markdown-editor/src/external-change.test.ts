import { describe, expect, it } from "vitest";

import { minimalTextChange } from "./external-change.js";

describe("minimalTextChange", () => {
  it("retains unchanged prefixes and suffixes", () => {
    expect(minimalTextChange("one middle three", "one changed three")).toEqual({
      from: 4,
      to: 10,
      insert: "changed",
    });
  });

  it("returns no transaction for identical text", () => {
    expect(minimalTextChange("same", "same")).toBeNull();
  });
});

import { sourceId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { selectedValue } from "./selected-resource.js";

describe("selectedValue", () => {
  it("does not substitute an empty value while the selected source draft is pending", () => {
    expect(selectedValue(sourceId("src_one"), null)).toEqual({ matched: false });
  });

  it("rejects a stale draft from the previously selected source", () => {
    expect(
      selectedValue(sourceId("src_two"), {
        sourceId: sourceId("src_one"),
        value: "First source note",
      }),
    ).toEqual({ matched: false });
  });

  it("retains an intentionally empty draft once it is hydrated", () => {
    expect(
      selectedValue(sourceId("src_one"), {
        sourceId: sourceId("src_one"),
        value: "",
      }),
    ).toEqual({ matched: true, value: "" });
  });
});

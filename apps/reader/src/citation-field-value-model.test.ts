import { describe, expect, it } from "vitest";

import {
  customValueType,
  datePartText,
  defaultCustomValue,
  nextCustomKey,
  numberValue,
  parseDatePart,
  parseJson,
  renameKey,
  updateDatePart,
  updateObject,
  withoutKey,
} from "./citation-field-value-model.js";

describe("schema-shaped citation field values", () => {
  it("edits partial dates and ranges without discarding other date properties", () => {
    const started = updateDatePart({ season: "Spring" }, 0, "2026-8");
    expect(started).toEqual({ season: "Spring", "date-parts": [[2026, 8]] });
    expect(updateDatePart(started, 1, "2026-10-2")).toEqual({
      season: "Spring",
      "date-parts": [
        [2026, 8],
        [2026, 10, 2],
      ],
    });
    expect(datePartText(started, 0)).toBe("2026-08");
    expect(parseDatePart("44 BCE")).toEqual(["44 BCE"]);
  });

  it("updates and removes optional date properties", () => {
    expect(updateObject({ season: 1 }, "circa", true)).toEqual({ season: 1, circa: true });
    expect(updateObject({ season: 1, circa: true }, "circa", undefined)).toEqual({ season: 1 });
  });

  it("manages arbitrary custom keys without requiring whole-object JSON", () => {
    const custom = { reviewed: true, score: 2 };
    expect(renameKey(custom, "reviewed", "verified")).toEqual({ verified: true, score: 2 });
    expect(withoutKey(custom, "score")).toEqual({ reviewed: true });
    expect(nextCustomKey({ "property-2": "used" })).toBe("property-3");
    expect(customValueType(["nested"])).toBe("json");
    expect(defaultCustomValue("boolean")).toBe(true);
  });

  it("parses explicit numeric and advanced JSON values", () => {
    expect(numberValue("12.5")).toBe(12.5);
    expect(numberValue("")).toBe("");
    expect(parseJson('{"nested":true}')).toEqual({ valid: true, value: { nested: true } });
    expect(parseJson("{")).toEqual({ valid: false });
  });
});

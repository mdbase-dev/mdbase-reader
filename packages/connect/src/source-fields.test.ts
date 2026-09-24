import { describe, expect, it } from "vitest";

import { fieldPatch } from "./source-fields.js";

describe("source field patches", () => {
  it("patches top-level fields and removes them with null", () => {
    expect(fieldPatch({ course: "a", priority: 1 }, { course: "b", priority: null })).toEqual({
      course: "b",
      priority: null,
    });
  });

  it("merges dotted fields into the record's current objects", () => {
    const frontmatter = { csl: { title: "T", volume: "3", issue: "2" } };
    expect(fieldPatch(frontmatter, { "csl.volume": "4", "csl.issue": null })).toEqual({
      csl: { title: "T", volume: "4" },
    });
    expect(fieldPatch({}, { "project.phase": "draft" })).toEqual({ project: { phase: "draft" } });
  });

  it("refuses fields the source contract maintains", () => {
    expect(() => fieldPatch({}, { id: "x" })).toThrow(/maintained by Reader/u);
    expect(() => fieldPatch({}, { documents: [] })).toThrow(/maintained by Reader/u);
    expect(() => fieldPatch({}, { reading: {} })).toThrow(/maintained by Reader/u);
    expect(fieldPatch({ reading: { status: "queued" } }, { "reading.status": "reading" })).toEqual({
      reading: { status: "reading" },
    });
  });
});

import { collectionId, sourceId, type SourceSummary } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import {
  conditionToCel,
  fieldShape,
  fieldValueSuggestions,
  isActiveCondition,
  matchesCondition,
  parseConditions,
  type FieldCondition,
} from "./library-conditions.js";

function source(properties: Record<string, unknown>): SourceSummary {
  return {
    collectionId: collectionId("test"),
    id: sourceId("s"),
    path: "sources/s.md",
    title: "S",
    creators: [],
    tags: [],
    documents: [],
    properties,
  };
}

const when = (condition: FieldCondition, properties: Record<string, unknown>): boolean =>
  matchesCondition(source(properties), condition);

describe("field conditions", () => {
  it("matches a wikilink by its alias and a list by any item", () => {
    const course = { key: "course", operator: "is", value: "Philosophy of attention" } as const;
    expect(when(course, { course: "[[courses/phil|Philosophy of attention]]" })).toBe(true);
    expect(when(course, { course: ["[[x|Other]]", "philosophy of attention"] })).toBe(true);
    expect(when({ ...course, operator: "is-not" }, { course: "[[x|Other]]" })).toBe(true);
    expect(
      when(
        { ...course, operator: "contains", value: "attention" },
        { course: "[[x|Philosophy of attention]]" },
      ),
    ).toBe(true);
  });

  it("compares numbers numerically and dates as text", () => {
    const priority = { key: "priority", operator: "at-most", value: "2" } as const;
    expect(when(priority, { priority: 2 })).toBe(true);
    expect(when(priority, { priority: 10 })).toBe(false);
    expect(
      when({ key: "due", operator: "less-than", value: "2026-10-01" }, { due: "2026-09-30" }),
    ).toBe(true);
    expect(when({ key: "due", operator: "less-than", value: "2026-10-01" }, {})).toBe(false);
  });

  it("treats missing, null, blank and empty lists as empty", () => {
    const empty = { key: "course", operator: "empty", value: "" } as const;
    expect(
      [{}, { course: null }, { course: "" }, { course: [] }].every((p) => when(empty, p)),
    ).toBe(true);
    expect(when({ ...empty, operator: "not-empty" }, { course: "x" })).toBe(true);
  });

  it("ignores half-written conditions and parses only valid ones", () => {
    expect(isActiveCondition({ key: "course", operator: "is", value: " " })).toBe(false);
    expect(when({ key: "course", operator: "is", value: "" }, {})).toBe(true);
    expect(
      parseConditions([
        { key: "course", operator: "is", value: "x" },
        { key: "bad key", operator: "is", value: "x" },
        { key: "priority", operator: "nope" },
      ]),
    ).toEqual([{ key: "course", operator: "is", value: "x" }]);
  });

  it("writes CEL for scalar and list fields, text, numbers and hyphenated keys", () => {
    expect(conditionToCel({ key: "priority", operator: "at-least", value: "3" }, "scalar")).toBe(
      "priority >= 3",
    );
    expect(conditionToCel({ key: "issue", operator: "is", value: "2" }, "scalar")).toBe(
      '(issue == 2 || issue == "2")',
    );
    const tag = conditionToCel({ key: "tags", operator: "is", value: "a.b" }, "list") ?? "";
    expect(tag).toMatch(/^tags\.exists\(entry, entry\.matches\("\(\?i\)\^\(a\\\\\.b\|/u);
    expect(
      conditionToCel({ key: "csl.container-title", operator: "contains", value: "x" }, "scalar"),
    ).toBe('csl["container-title"].matches("(?i)x")');
    expect(conditionToCel({ key: "my-field", operator: "empty", value: "" }, "scalar")).toBe(
      '(record["my-field"] == null || record["my-field"] == "")',
    );
    expect(conditionToCel({ key: "course", operator: "is-not", value: "x" }, "scalar")).toMatch(
      /^\(course == null \|\| !course\.matches\(/u,
    );
    expect(conditionToCel({ key: "tags", operator: "empty", value: "" }, "list")).toBe(
      "(tags == null || tags.size() == 0)",
    );
    expect(conditionToCel({ key: "course", operator: "is", value: "" }, "scalar")).toBeNull();
  });

  it("reads fields from another record when given a base", () => {
    const base = "source.asFile()";
    expect(
      conditionToCel({ key: "reading.progress", operator: "at-least", value: "1" }, "scalar", base),
    ).toBe("source.asFile().reading.progress >= 1");
    expect(conditionToCel({ key: "my-field", operator: "empty", value: "" }, "scalar", base)).toBe(
      '(source.asFile()["my-field"] == null || source.asFile()["my-field"] == "")',
    );
  });

  it("detects list-valued fields from the library", () => {
    expect(fieldShape([source({ tags: ["a"] }), source({})], "tags")).toBe("list");
    expect(fieldShape([source({ course: "x" })], "course")).toBe("scalar");
  });

  it("suggests the commonest readable values of a field", () => {
    const sources = [
      source({ course: "[[c/a|Alpha]]" }),
      source({ course: "[[c/a|Alpha]]" }),
      source({ course: ["Beta"] }),
    ];
    expect(fieldValueSuggestions(sources, "course")).toEqual(["Alpha", "Beta"]);
  });
});

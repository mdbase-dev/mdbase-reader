import { describe, expect, it } from "vitest";

import {
  additionalCslFieldDefinitions,
  citationDateText,
  citationDifferences,
  cslDate,
  cslFieldLabel,
  displayCslValue,
  emptyCslFieldValue,
  mergeCitation,
  resolutionRequest,
  updateCitationField,
} from "./citation-form-model.js";

describe("citation form model", () => {
  it("offers every non-core CSL variable with a schema-shaped initial value", () => {
    expect(additionalCslFieldDefinitions.some(({ name }) => name === "accessed")).toBe(true);
    expect(additionalCslFieldDefinitions.some(({ name }) => name === "reviewed-author")).toBe(true);
    expect(additionalCslFieldDefinitions.some(({ name }) => name === "custom")).toBe(true);
    expect(emptyCslFieldValue("date")).toEqual({});
    expect(emptyCslFieldValue("name")).toEqual([]);
    expect(cslFieldLabel("original-publisher-place")).toBe("Original publisher place");
    expect(cslFieldLabel("PMCID")).toBe("PMCID");
  });

  it("updates known fields without losing unknown structured data", () => {
    expect(
      updateCitationField(
        { id: "one", type: "book", custom: { reviewed: true } },
        "title",
        "A book",
      ),
    ).toEqual({ id: "one", type: "book", title: "A book", custom: { reviewed: true } });
  });

  it("round trips partial and literal dates", () => {
    expect(cslDate("2026-8")).toEqual({ "date-parts": [[2026, 8]] });
    expect(citationDateText({ issued: cslDate("2026-8") }, "issued")).toBe("2026-08");
    expect(cslDate("Spring 2026")).toEqual({ literal: "Spring 2026" });
  });

  it("merges only explicitly selected candidate fields", () => {
    const candidate = { id: "remote", type: "book", title: "New", publisher: "Press" };
    expect(
      mergeCitation({ id: "local", type: "book", title: "Old" }, candidate, new Set(["publisher"])),
    ).toEqual({ id: "local", type: "book", title: "Old", publisher: "Press" });
    expect(
      citationDifferences({ id: "local", type: "book", title: "Old" }, candidate).map(
        ({ field }) => field,
      ),
    ).toEqual(["title", "publisher"]);
  });

  it("classifies lookup input without provider knowledge", () => {
    expect(resolutionRequest("10.1234/example").kind).toBe("identifier");
    expect(resolutionRequest("https://example.com/paper").kind).toBe("url");
    expect(resolutionRequest("A paper title").kind).toBe("text");
  });

  it("presents structured metadata as human-readable review text", () => {
    expect(displayCslValue([{ given: "Simone", family: "Weil" }])).toBe("Simone Weil");
    expect(displayCslValue({ "date-parts": [[1952, 4]] })).toBe("1952-4");
    expect(displayCslValue(undefined)).toBe("Not recorded");
  });
});

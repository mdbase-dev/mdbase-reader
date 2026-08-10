import { describe, expect, it } from "vitest";

import { cslFieldDefinitions, cslTypes } from "./citation-schema.js";
import { validateCslItem } from "./citation.js";
import cslDataSchema from "./csl-data.schema.json" with { type: "json" };

describe("official CSL-JSON schema mirror", () => {
  it("derives every item type and variable from the vendored official schema", () => {
    const officialProperties = Object.keys(cslDataSchema.items.properties);
    expect([...cslTypes]).toEqual(cslDataSchema.items.properties.type.enum);
    expect(cslFieldDefinitions.map(({ name }) => name)).toEqual(
      officialProperties
        .filter((name) => name !== "id" && name !== "type")
        .sort((left, right) => left.localeCompare(right)),
    );
  });

  it("accepts one item containing every official CSL variable", () => {
    const item = Object.fromEntries([
      ["id", "complete-record"],
      ["type", "book"],
      ...cslFieldDefinitions.map(({ name, kind }) => [name, validValue(kind)]),
    ]);
    expect(validateCslItem(item)).toEqual({ valid: true, item });
  });
});

function validValue(kind: (typeof cslFieldDefinitions)[number]["kind"]): unknown {
  switch (kind) {
    case "date":
    case "object":
      return {};
    case "name":
    case "string-list":
      return [];
    case "number":
      return 1;
    case "string":
      return "value";
  }
}

import { describe, expect, it } from "vitest";

import {
  sourceCitationDifferences,
  sourceFieldsFromCitation,
} from "./source-fields-from-citation.js";

describe("sourceFieldsFromCitation", () => {
  it("renders names, dates and links as friendly source fields", () => {
    expect(
      sourceFieldsFromCitation({
        id: "weil2002",
        type: "book",
        title: " Gravity and Grace ",
        author: [
          { given: "Simone", family: "Weil" },
          { given: "Ludwig", "non-dropping-particle": "van", family: "Beethoven" },
          { literal: "Routledge Editors" },
        ],
        issued: { "date-parts": [[2002, 3, 1]] },
        URL: "https://example.com/weil",
      }),
    ).toEqual({
      title: "Gravity and Grace",
      authors: ["Simone Weil", "Ludwig van Beethoven", "Routledge Editors"],
      published: "2002-03-01",
      url: "https://example.com/weil",
    });
  });

  it("keeps a bare year numeric and omits fields the citation lacks", () => {
    expect(
      sourceFieldsFromCitation({ id: "a", type: "book", issued: { "date-parts": [[2002]] } }),
    ).toEqual({ published: 2002 });
    expect(
      sourceFieldsFromCitation({ id: "a", type: "book", issued: { raw: "Spring 1999" } }),
    ).toEqual({ published: "Spring 1999" });
  });
});

describe("sourceCitationDifferences", () => {
  const citation = {
    id: "weil2002",
    type: "book",
    title: "Gravity and Grace",
    author: [{ given: "Simone", family: "Weil" }],
    issued: { "date-parts": [[2002]] },
  };

  it("reports only fields that disagree", () => {
    expect(
      sourceCitationDifferences(
        { title: "gravity-and-grace.pdf", authors: ["Simone Weil"], published: 2002 },
        citation,
      ),
    ).toEqual([
      { field: "title", current: "gravity-and-grace.pdf", citation: "Gravity and Grace" },
    ]);
  });

  it("treats a more precise source date as agreeing", () => {
    expect(
      sourceCitationDifferences(
        { title: "Gravity and Grace", authors: ["Simone Weil"], published: "2002-03-01" },
        citation,
      ),
    ).toEqual([]);
  });

  it("reports fields the source is missing", () => {
    expect(sourceCitationDifferences({ title: "Gravity and Grace" }, citation)).toEqual([
      { field: "authors", current: undefined, citation: ["Simone Weil"] },
      { field: "published", current: undefined, citation: 2002 },
    ]);
  });
});

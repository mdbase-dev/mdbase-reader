import { describe, expect, it } from "vitest";

import {
  sourceCitationDifferences,
  sourceFieldsFromCitation,
} from "./source-fields-from-citation.js";

describe("sourceFieldsFromCitation", () => {
  it("renders names, dates and links as friendly source fields", () => {
    expect(
      sourceFieldsFromCitation({
        id: "dostoevsky2002",
        type: "book",
        title: " Crime and Punishment ",
        author: [
          { given: "Fyodor", family: "Dostoevsky" },
          { given: "Ludwig", "non-dropping-particle": "van", family: "Beethoven" },
          { literal: "Heinemann Editors" },
        ],
        issued: { "date-parts": [[2002, 3, 1]] },
        URL: "https://example.com/dostoevsky",
      }),
    ).toEqual({
      title: "Crime and Punishment",
      authors: ["Fyodor Dostoevsky", "Ludwig van Beethoven", "Heinemann Editors"],
      published: "2002-03-01",
      url: "https://example.com/dostoevsky",
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
    id: "dostoevsky2002",
    type: "book",
    title: "Crime and Punishment",
    author: [{ given: "Fyodor", family: "Dostoevsky" }],
    issued: { "date-parts": [[2002]] },
  };

  it("reports only fields that disagree", () => {
    expect(
      sourceCitationDifferences(
        { title: "crime-and-punishment.pdf", authors: ["Fyodor Dostoevsky"], published: 2002 },
        citation,
      ),
    ).toEqual([
      { field: "title", current: "crime-and-punishment.pdf", citation: "Crime and Punishment" },
    ]);
  });

  it("treats a more precise source date as agreeing", () => {
    expect(
      sourceCitationDifferences(
        { title: "Crime and Punishment", authors: ["Fyodor Dostoevsky"], published: "2002-03-01" },
        citation,
      ),
    ).toEqual([]);
  });

  it("reports fields the source is missing", () => {
    expect(sourceCitationDifferences({ title: "Crime and Punishment" }, citation)).toEqual([
      { field: "authors", current: undefined, citation: ["Fyodor Dostoevsky"] },
      { field: "published", current: undefined, citation: 2002 },
    ]);
  });
});

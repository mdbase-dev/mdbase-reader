import { describe, expect, it } from "vitest";

import { citekeyForCitation, citationCompletenessWarnings } from "./citation-citekey.js";

import type { SourceSummary } from "../domain/source.js";

describe("citation citekeys and quality", () => {
  it("builds a deterministic key and resolves library collisions", () => {
    const sources = [
      {
        id: "src_other",
        title: "Other",
        creators: [],
        tags: [],
        citation: { id: "smithmeaning2022", type: "book" },
      },
    ] as unknown as readonly SourceSummary[];
    expect(
      citekeyForCitation(
        {
          type: "book",
          title: "The Meaning of Reading",
          author: [{ given: "Jane", family: "Smith" }],
          issued: { "date-parts": [[2022]] },
        },
        sources,
      ),
    ).toBe("smithmeaning2022a");
  });

  it("separates valid-but-incomplete citation warnings", () => {
    expect(citationCompletenessWarnings({ id: "work", type: "article-journal" })).toEqual([
      "Add a title before using this citation in a bibliography.",
      "No author or editor is recorded.",
      "No publication date is recorded.",
      "A journal article normally needs a journal title.",
    ]);
  });

  it("flags a DOI URL without treating it as invalid CSL", () => {
    expect(
      citationCompletenessWarnings({
        id: "work",
        type: "book",
        title: "A work",
        author: [{ literal: "Press" }],
        issued: { "date-parts": [[2026]] },
        DOI: "https://doi.org/10.1234/example",
      }),
    ).toContain("Store the bare DOI rather than its https://doi.org/ URL.");
  });
});

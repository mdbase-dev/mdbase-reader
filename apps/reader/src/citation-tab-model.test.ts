import { citationCompletenessWarnings } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import {
  citationDetailRows,
  citationEvidenceSummary,
  citationHealth,
  citationIdentifiers,
  uncoveredWarnings,
  warningFields,
} from "./citation-tab-model.js";

describe("citation detail rows", () => {
  it("lists type, people, date, venue and identifiers in plain words", () => {
    expect(
      citationDetailRows({
        id: "k",
        type: "article-journal",
        author: [{ family: "Kingma", given: "Diederik P." }, { literal: "OpenAI" }],
        issued: { "date-parts": [[2015, 5]] },
        "container-title": "Journal of Optimisation",
        DOI: "10.1000/1",
      }),
    ).toEqual([
      { label: "Type", value: "Journal article", needed: true },
      { label: "Authors", value: "Diederik P. Kingma, OpenAI", needed: true },
      { label: "Published", value: "2015-05", needed: true },
      { label: "Journal", value: "Journal of Optimisation", needed: true },
      { label: "Identifiers", value: "DOI 10.1000/1" },
    ]);
  });

  it("marks needed fields that are missing and names editors when there are no authors", () => {
    const rows = citationDetailRows({
      type: "chapter",
      editor: [{ family: "Ba", given: "Jimmy" }],
    });
    expect(rows).toContainEqual({ label: "Editors", value: "Jimmy Ba" });
    expect(rows).toContainEqual({ label: "Published", value: null, needed: true });
    expect(rows).toContainEqual({ label: "Book", value: null, needed: true });
  });

  it("omits a venue row only when the type does not need one and none is set", () => {
    expect(citationDetailRows({ type: "book" }).map(({ label }) => label)).toEqual([
      "Type",
      "Authors",
      "Published",
    ]);
  });

  it("joins identifiers and keeps the URL last", () => {
    expect(citationIdentifiers({ URL: "https://example.org", ISBN: "978-0", PMID: 12 })).toBe(
      "ISBN 978-0 · PMID 12 · https://example.org",
    );
    expect(citationIdentifiers({})).toBeNull();
  });
});

describe("citation health", () => {
  it("puts invalid drafts first", () => {
    expect(
      citationHealth({ valid: false, message: "Title is required.", warnings: [], gaps: [] }),
    ).toEqual({ tone: "invalid", title: "Fix before saving", detail: "Title is required." });
  });

  it("counts details to check once, preferring what the library records", () => {
    expect(
      citationHealth({
        valid: true,
        warnings: ["No publication date is recorded."],
        gaps: ["issued"],
      }),
    ).toEqual({
      tone: "check",
      title: "1 detail to check",
      detail: "The library records the date; add it to the citation.",
    });
    expect(citationHealth({ valid: true, warnings: ["A", "B"], gaps: [] })).toMatchObject({
      title: "2 details to check",
      detail: "A",
    });
    expect(citationHealth({ valid: true, warnings: [], gaps: ["author", "URL"] })).toMatchObject({
      title: "2 details to check",
      detail: "The library records the authors and URL; add them to the citation.",
    });
  });

  it("counts distinct items: a gap and an unrelated warning are two", () => {
    expect(
      citationHealth({
        valid: true,
        warnings: [
          "No publication date is recorded.",
          "A journal article normally needs a journal title.",
        ],
        gaps: ["issued", "URL"],
      }),
    ).toMatchObject({ title: "3 details to check" });
    expect(
      uncoveredWarnings(
        ["No publication date is recorded.", "No author or editor is recorded."],
        ["issued"],
      ),
    ).toEqual(["No author or editor is recorded."]);
  });

  it("keys the field warnings core actually emits", () => {
    const warnings = citationCompletenessWarnings({ id: "k", type: "book", title: "T" });
    for (const warning of Object.keys(warningFields)) {
      expect(warnings).toContain(warning);
    }
  });

  it("stays calm when nothing needs checking", () => {
    expect(citationHealth({ valid: true, warnings: [], gaps: [] })).toEqual({
      tone: "complete",
      title: "Citation details look complete",
    });
  });
});

describe("citation evidence summary", () => {
  it("names distinct evidence, skipping the citation key", () => {
    expect(
      citationEvidenceSummary(
        { id: "k", title: "T", publisher: "P", issued: { "date-parts": [[2015]] } },
        {
          title: { value: "T", source: "registry:doi.org" },
          publisher: { value: "P", source: "registry:doi.org" },
          issued: { value: { "date-parts": [[2015]] }, source: "page:json-ld" },
        },
      ),
    ).toBe("doi.org · page metadata");
  });

  it("abbreviates long lists", () => {
    expect(
      citationEvidenceSummary(
        { title: "T", publisher: "P", language: "en" },
        {
          title: { value: "T", source: "registry:doi.org" },
          publisher: { value: "P", source: "page:html" },
        },
      ),
    ).toBe("doi.org · page title +1");
  });
});

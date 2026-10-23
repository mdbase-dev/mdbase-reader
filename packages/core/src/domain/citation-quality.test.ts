import { describe, expect, it } from "vitest";

import { summariseCitationQuality } from "./citation-quality.js";

describe("local citation quality", () => {
  it("counts current fields, external edits by original kind, and removals", () => {
    const summary = summariseCitationQuality([
      {
        csl: {
          title: "Private title",
          author: ["Private author"],
          language: "en",
          URL: "private-url",
        },
        cslProvenance: {
          title: { value: "Private title", source: "registry:doi.org" },
          author: { value: ["Old author"], source: "site-adapter:private-site" },
          language: { value: "en", source: "user" },
          publisher: { value: "Private publisher", source: "page:json-ld" },
        },
      },
      {
        csl: { title: "Another title", issued: 2000 },
        cslProvenance: {
          title: { value: "Another title", source: "generic-remote:private-provider" },
          issued: { value: 1999, source: "registry:doi.org" },
          broken: { source: "page:html" },
        },
      },
      { csl: null },
    ]);
    expect(summary.sources).toBe(3);
    expect(summary.fieldsBySource).toEqual({
      registry: 1,
      "site-adapter": 0,
      page: 0,
      "generic-remote": 1,
      user: 3,
      unknown: 0,
      unexplained: 1,
    });
    expect(summary.editedBySource["site-adapter"]).toBe(1);
    expect(summary.editedBySource.registry).toBe(1);
    expect(summary.removedBySource.page).toBe(1);
    expect(summary.removedFields).toBe(1);
    expect(JSON.stringify(summary)).not.toMatch(/Private|private|title|author|doi.org/u);
  });

  it("handles an empty library and limits unknown labels to a fixed bucket", () => {
    expect(summariseCitationQuality([]).removedFields).toBe(0);
    expect(
      summariseCitationQuality([
        { csl: { title: "A" }, cslProvenance: { title: { value: "A", source: "secret" } } },
      ]).fieldsBySource.unknown,
    ).toBe(1);
  });
});

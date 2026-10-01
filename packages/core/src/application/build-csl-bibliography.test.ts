import { describe, expect, it } from "vitest";

import { collectionId, sourceId } from "../domain/identity.js";

import { buildCslBibliography, serializeCslBibliography } from "./build-csl-bibliography.js";

import type { SourceSummary } from "../domain/source.js";

const source = (
  overrides: Partial<SourceSummary> & Pick<SourceSummary, "id" | "title">,
): SourceSummary => ({
  collectionId: collectionId("reading"),
  path: `sources/${overrides.id}.md`,
  creators: [],
  tags: [],
  documents: [],
  ...overrides,
});

describe("buildCslBibliography", () => {
  it("exports complete CSL objects in library order", () => {
    const first = {
      id: "dostoevsky2002",
      type: "book",
      title: "Crime and Punishment",
      custom: { shelf: "A" },
    };
    const second = { id: "eliot1871", type: "book", title: "Middlemarch" };

    const result = buildCslBibliography([
      source({ id: sourceId("src_one"), title: "One", citation: first }),
      source({ id: sourceId("src_two"), title: "Two", citation: second }),
    ]);

    expect(result).toEqual({ items: [first, second], problems: [] });
    expect(serializeCslBibliography(result.items)).toBe(
      `${JSON.stringify([first, second], null, 2)}\n`,
    );
  });

  it("reports missing and invalid citation records without discarding valid items", () => {
    const result = buildCslBibliography([
      source({
        id: sourceId("src_valid"),
        title: "Valid",
        citation: { id: "valid2026", type: "article" },
      }),
      source({ id: sourceId("src_missing"), title: "Missing" }),
      source({
        id: sourceId("src_invalid"),
        title: "Invalid",
        citationProblems: [{ path: "csl.id", message: "must be a citekey" }],
      }),
    ]);

    expect(result.items.map(({ id }) => id)).toEqual(["valid2026"]);
    expect(result.problems.map(({ kind }) => kind)).toEqual(["missing", "invalid"]);
    expect(result.problems[1]?.message).toBe("csl.id must be a citekey");
  });

  it("excludes every item involved in a duplicate citekey", () => {
    const result = buildCslBibliography([
      source({
        id: sourceId("src_one"),
        title: "One",
        citation: { id: "shared2026", type: "article" },
      }),
      source({
        id: sourceId("src_two"),
        title: "Two",
        citation: { id: "shared2026", type: "book" },
      }),
    ]);

    expect(result.items).toEqual([]);
    expect(result.problems).toHaveLength(2);
    expect(result.problems.every(({ kind }) => kind === "duplicate")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { DomainError } from "./errors.js";
import { loadedCitation, sourceLink } from "./source.js";

import type { SourceSummary } from "./source.js";

describe("sourceLink", () => {
  it("links by path with the title as alias", () => {
    expect(sourceLink({ path: "sources/dostoevsky.md", title: "Crime and Punishment" })).toBe(
      "[[sources/dostoevsky|Crime and Punishment]]",
    );
  });

  it("strips characters that would end the alias or the link", () => {
    expect(sourceLink({ path: "sources/a.md", title: " A | [[B]]\n C " })).toBe(
      "[[sources/a|A B C]]",
    );
  });

  it("omits an empty alias", () => {
    expect(sourceLink({ path: "sources/a.md", title: "[]|" })).toBe("[[sources/a]]");
  });

  it("rejects a path that can terminate the wikilink", () => {
    expect(() => sourceLink({ path: "sources/a]]b.md", title: "A" })).toThrow(DomainError);
  });
});

describe("loadedCitation", () => {
  const summary = {
    collectionId: "c",
    id: "s",
    path: "sources/s.md",
    title: "S",
    creators: [],
    tags: [],
    documents: [],
  } as unknown as SourceSummary;
  const citation = { id: "s2020", type: "book", title: "S" };

  it("returns the raw csl as read, including invalid values, or null when there is none", () => {
    expect(loadedCitation({ ...summary, properties: { csl: { broken: true } } })).toEqual({
      broken: true,
    });
    expect(loadedCitation({ ...summary, properties: { title: "S" } })).toBeNull();
  });

  it("falls back to the parsed citation when the record was not read whole", () => {
    expect(loadedCitation({ ...summary, citation })).toBe(citation);
    expect(loadedCitation(summary)).toBeUndefined();
  });
});

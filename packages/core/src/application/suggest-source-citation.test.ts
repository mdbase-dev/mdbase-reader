import { describe, expect, it } from "vitest";

import { collectionId, recordRevision, sourceId } from "../domain/identity.js";

import {
  citationGapsFromSource,
  suggestSourceCitation,
  suggestedCitekey,
} from "./suggest-source-citation.js";

import type { Source } from "../domain/source.js";

const source: Source = {
  collectionId: collectionId("reading"),
  id: sourceId("src_gravity"),
  path: "sources/gravity.md",
  title: "Gravity and Grace",
  creators: ["Simone Weil"],
  tags: [],
  kind: "book",
  published: "2002-03-01",
  documents: [],
  body: "",
  recordRevision: recordRevision("rev-one"),
  frontmatter: {
    site: "Routledge",
    description: "A collection of philosophical reflections.",
    language: "en",
  },
};

describe("source citation suggestions", () => {
  it("turns friendly metadata into reviewable CSL without persisting it", () => {
    expect(suggestSourceCitation(source)).toEqual({
      id: "weilgravity2002",
      type: "book",
      title: "Gravity and Grace",
      author: [{ literal: "Simone Weil" }],
      issued: { "date-parts": [[2002, 3, 1]] },
      "container-title": "Routledge",
      abstract: "A collection of philosophical reflections.",
      language: "en",
    });
  });

  it("uses a deterministic identity fallback for sparse metadata", () => {
    expect(suggestedCitekey("A", [], undefined, "src_01ABCDEF")).toBe("ref01abcdef");
  });
});

describe("citationGapsFromSource", () => {
  const bare: Source = {
    collectionId: collectionId("reading"),
    id: sourceId("src_weil"),
    path: "sources/weil.md",
    title: "Gravity and Grace",
    creators: ["Simone Weil"],
    tags: [],
    documents: [],
    body: "",
    recordRevision: recordRevision("rev"),
    frontmatter: {},
  };
  const library: Source = { ...bare, published: 1952, url: "https://example.com/weil" };

  it("fills only the fields the citation leaves empty", () => {
    expect(
      citationGapsFromSource(
        { id: "weil", type: "book", title: "Gravity and Grace", author: [{ family: "Weil" }] },
        library,
      ),
    ).toEqual({ issued: { "date-parts": [[1952]] }, URL: "https://example.com/weil" });
  });

  it("offers nothing when the citation is complete or the source has nothing to add", () => {
    expect(
      citationGapsFromSource(
        {
          id: "weil",
          type: "book",
          author: [{ family: "Weil" }],
          issued: { "date-parts": [[1947]] },
          URL: "https://other.example",
        },
        library,
      ),
    ).toEqual({});
    expect(citationGapsFromSource({ id: "weil", type: "book" }, { ...bare, creators: [] })).toEqual(
      {},
    );
  });
});

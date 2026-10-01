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
  id: sourceId("src_crime"),
  path: "sources/crime.md",
  title: "Crime and Punishment",
  creators: ["Fyodor Dostoevsky"],
  tags: [],
  kind: "book",
  published: "2002-03-01",
  documents: [],
  body: "",
  recordRevision: recordRevision("rev-one"),
  frontmatter: {
    site: "Heinemann",
    description: "A collection of philosophical reflections.",
    language: "en",
  },
};

describe("source citation suggestions", () => {
  it("turns friendly metadata into reviewable CSL without persisting it", () => {
    expect(suggestSourceCitation(source)).toEqual({
      id: "dostoevskycrime2002",
      type: "book",
      title: "Crime and Punishment",
      author: [{ literal: "Fyodor Dostoevsky" }],
      issued: { "date-parts": [[2002, 3, 1]] },
      "container-title": "Heinemann",
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
    id: sourceId("src_dostoevsky"),
    path: "sources/dostoevsky.md",
    title: "Crime and Punishment",
    creators: ["Fyodor Dostoevsky"],
    tags: [],
    documents: [],
    body: "",
    recordRevision: recordRevision("rev"),
    frontmatter: {},
  };
  const library: Source = { ...bare, published: 1914, url: "https://example.com/dostoevsky" };

  it("fills only the fields the citation leaves empty", () => {
    expect(
      citationGapsFromSource(
        {
          id: "dostoevsky",
          type: "book",
          title: "Crime and Punishment",
          author: [{ family: "Dostoevsky" }],
        },
        library,
      ),
    ).toEqual({ issued: { "date-parts": [[1914]] }, URL: "https://example.com/dostoevsky" });
  });

  it("offers nothing when the citation is complete or the source has nothing to add", () => {
    expect(
      citationGapsFromSource(
        {
          id: "dostoevsky",
          type: "book",
          author: [{ family: "Dostoevsky" }],
          issued: { "date-parts": [[1866]] },
          URL: "https://other.example",
        },
        library,
      ),
    ).toEqual({});
    expect(
      citationGapsFromSource({ id: "dostoevsky", type: "book" }, { ...bare, creators: [] }),
    ).toEqual({});
  });
});

import { collectionId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { mergeSearchMatches, mergeSearchResults } from "./use-library-search.js";

import type { SourceSummary, SourceTextSearchMatch } from "@mdbase-reader/core";

const sources: readonly SourceSummary[] = [
  {
    collectionId: collectionId("reading"),
    id: sourceId("src_metadata"),
    path: "sources/metadata.md",
    title: "Attention and Will",
    creators: ["Simone Weil"],
    tags: [],
    documents: [],
  },
  {
    collectionId: collectionId("reading"),
    id: sourceId("src_note"),
    path: "sources/note.md",
    title: "Gravity and Grace",
    creators: [],
    tags: [],
    documents: [],
  },
];

describe("mergeSearchResults", () => {
  it("unions immediate metadata matches with derived text matches in library order", () => {
    const textMatch: SourceTextSearchMatch = {
      sourceId: sourceId("src_note"),
      kinds: ["annotation"],
    };

    expect(
      mergeSearchResults(sources, "attention", new Map([[textMatch.sourceId, textMatch]])).map(
        ({ id }) => id,
      ),
    ).toEqual(["src_metadata", "src_note"]);
  });

  it("returns the complete library when the query is empty", () => {
    expect(mergeSearchResults(sources, " ", new Map())).toBe(sources);
  });
});

describe("mergeSearchMatches", () => {
  it("unifies canonical and extracted document evidence per source", () => {
    const source = sourceId("source-1");
    expect(
      mergeSearchMatches(
        [{ sourceId: source, kinds: ["source-note"] }],
        [{ sourceId: source, kinds: ["document"] }],
      ),
    ).toEqual([{ sourceId: source, kinds: ["source-note", "document"] }]);
  });
});

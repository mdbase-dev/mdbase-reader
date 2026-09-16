import { annotationId, collectionId, dateTime, sourceId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import {
  sourceNoteCitationCandidates,
  sourceNoteWikiCandidates,
} from "./source-note-references.js";

const collection = collectionId("reading");
const source = {
  collectionId: collection,
  id: sourceId("weil"),
  path: "sources/gravity.md",
  title: "Gravity and Grace",
  creators: ["Simone Weil"],
  tags: [],
  documents: [],
  citation: {
    id: "weil1952",
    type: "book",
    title: "Gravity and Grace",
    author: [{ family: "Weil", given: "Simone" }],
    issued: { "date-parts": [[1952]] },
  },
} as const;

describe("source note references", () => {
  it("offers source links, annotations, and citations", () => {
    const annotations = [
      {
        collectionId: collection,
        id: annotationId("attention"),
        sourceId: source.id,
        source: "[[weil]]",
        annotationType: "note",
        tags: [],
        body: "Attention",
        createdAt: dateTime("2026-08-13T00:00:00.000Z"),
      },
    ] as const;

    expect(sourceNoteWikiCandidates([source], annotations).map(({ path }) => path)).toEqual([
      "annotations/attention",
      "sources/gravity",
    ]);
    expect(sourceNoteCitationCandidates([source])).toEqual([
      {
        id: "weil1952",
        label: "Gravity and Grace",
        detail: "Simone Weil",
        display: "Weil 1952",
      },
    ]);
  });
});

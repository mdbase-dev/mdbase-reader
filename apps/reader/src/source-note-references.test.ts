import { annotationId, collectionId, dateTime, sourceId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import {
  sourceNoteCitationCandidates,
  sourceNoteWikiCandidates,
} from "./source-note-references.js";

const collection = collectionId("reading");
const source = {
  collectionId: collection,
  id: sourceId("dostoevsky"),
  path: "sources/crime.md",
  title: "Crime and Punishment",
  creators: ["Fyodor Dostoevsky"],
  tags: [],
  documents: [],
  citation: {
    id: "dostoevsky1914",
    type: "book",
    title: "Crime and Punishment",
    author: [{ family: "Dostoevsky", given: "Fyodor" }],
    issued: { "date-parts": [[1914]] },
  },
} as const;

describe("source note references", () => {
  it("offers source links, annotations, and citations", () => {
    const annotations = [
      {
        collectionId: collection,
        id: annotationId("attention"),
        sourceId: source.id,
        source: "[[dostoevsky]]",
        annotationType: "note",
        tags: [],
        body: "Attention",
        createdAt: dateTime("2026-08-13T00:00:00.000Z"),
      },
    ] as const;

    expect(sourceNoteWikiCandidates([source], annotations).map(({ path }) => path)).toEqual([
      "annotations/attention",
      "sources/crime",
    ]);
    expect(sourceNoteCitationCandidates([source])).toEqual([
      {
        id: "dostoevsky1914",
        label: "Crime and Punishment",
        detail: "Fyodor Dostoevsky",
        display: "Dostoevsky 1914",
      },
    ]);
  });
});

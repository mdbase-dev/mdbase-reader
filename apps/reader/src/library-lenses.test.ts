import { sourceId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { applyLibraryLens } from "./library-lenses.js";

import type { SourceSummary } from "@mdbase-reader/core";

const sources = [
  source("one", "reading", "application/pdf", true),
  source("two", "inbox", "application/epub+zip", false),
  source("three", "finished", "text/html", false),
];
const context = {
  recentSourceIds: [sourceId("three"), sourceId("one")],
  annotatedSourceIds: new Set([sourceId("two")]),
};

describe("reader library lenses", () => {
  it("keeps recent sources in recency order", () => {
    expect(applyLibraryLens(sources, "recent", context).map(({ id }) => id)).toEqual([
      "three",
      "one",
    ]);
  });

  it("filters reading state, annotations, citation gaps, and formats", () => {
    expect(applyLibraryLens(sources, "reading", context).map(({ id }) => id)).toEqual(["one"]);
    expect(applyLibraryLens(sources, "annotated", context).map(({ id }) => id)).toEqual(["two"]);
    expect(applyLibraryLens(sources, "missing-citation", context).map(({ id }) => id)).toEqual([
      "two",
      "three",
    ]);
    expect(applyLibraryLens(sources, "epub", context).map(({ id }) => id)).toEqual(["two"]);
  });
});

function source(
  id: string,
  readingStatus: NonNullable<SourceSummary["readingStatus"]>,
  mediaType: string,
  cited: boolean,
): SourceSummary {
  return {
    collectionId: "collection" as SourceSummary["collectionId"],
    id: sourceId(id),
    path: `${id}.md`,
    title: id,
    creators: [],
    tags: [],
    readingStatus,
    documents: [
      {
        file: `${id}.pdf`,
        fileId: `file-${id}` as never,
        mediaType,
        revision: "1" as never,
        role: "primary",
      },
    ],
    ...(cited ? { citation: { id, type: "article", title: id } } : {}),
  };
}

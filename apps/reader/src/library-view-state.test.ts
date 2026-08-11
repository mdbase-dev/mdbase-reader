import { sourceId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { sortLibrarySources } from "./library-view-state.js";

import type { SourceSummary } from "@mdbase-reader/core";

const sources = [
  source("z", "Zebra", "Adams", 2022),
  source("a", "Alpha", "Zola", 2024),
  source("m", "Middle", "Baker", 2020),
];

describe("library view sorting", () => {
  it("sorts by title, creator, and publication year", () => {
    expect(sortLibrarySources(sources, "title", []).map(({ id }) => id)).toEqual(["a", "m", "z"]);
    expect(sortLibrarySources(sources, "creator", []).map(({ id }) => id)).toEqual(["z", "m", "a"]);
    expect(sortLibrarySources(sources, "published", []).map(({ id }) => id)).toEqual([
      "a",
      "z",
      "m",
    ]);
  });

  it("puts recently opened sources first", () => {
    expect(
      sortLibrarySources(sources, "recent", [sourceId("m"), sourceId("a")]).map(({ id }) => id),
    ).toEqual(["m", "a", "z"]);
  });
});

function source(id: string, title: string, creator: string, published: number): SourceSummary {
  return {
    collectionId: "collection" as SourceSummary["collectionId"],
    id: sourceId(id),
    path: `${id}.md`,
    title,
    creators: [creator],
    tags: [],
    published,
    documents: [],
  };
}

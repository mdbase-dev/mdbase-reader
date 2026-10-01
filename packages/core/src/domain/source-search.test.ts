import { describe, expect, it } from "vitest";

import { collectionId, sourceId } from "./identity.js";
import { filterSources, type SourceSummary } from "./source.js";

const sources: readonly SourceSummary[] = [
  {
    collectionId: collectionId("reading"),
    id: sourceId("src_dostoevsky"),
    path: "sources/crime.md",
    title: "Crime and Punishment",
    creators: ["Fyodor Dostoevsky"],
    tags: ["attention"],
    documents: [],
  },
  {
    collectionId: collectionId("reading"),
    id: sourceId("src_tufte"),
    path: "sources/visual-display.md",
    title: "The Visual Display of Quantitative Information",
    creators: ["Edward Tufte"],
    publication: "Graphics Press",
    published: 2001,
    tags: ["design"],
    documents: [],
  },
];

describe("filterSources", () => {
  it("searches title, creators, and tags without mutating the library", () => {
    expect(filterSources(sources, "attention")).toEqual([sources[0]]);
    expect(filterSources(sources, "tufte")).toEqual([sources[1]]);
    expect(filterSources(sources, "graphics press")).toEqual([sources[1]]);
    expect(filterSources(sources, "2001")).toEqual([sources[1]]);
    expect(sources).toHaveLength(2);
  });
});

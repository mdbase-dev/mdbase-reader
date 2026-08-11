import { collectionId, recordRevision, sourceId, type Source } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { replaceLibrarySource } from "./use-library-selection.js";

const original: Source = {
  collectionId: collectionId("reading"),
  id: sourceId("source-1"),
  path: "sources/source-1.md",
  recordRevision: recordRevision("sha256:old"),
  title: "A source",
  creators: [],
  tags: [],
  readingStatus: "inbox",
  documents: [],
  body: "# A source\n",
  frontmatter: {},
};

describe("library source reconciliation", () => {
  it("replaces a mutated source without changing its library position or index state", () => {
    const replacement: Source = {
      ...original,
      recordRevision: recordRevision("sha256:new"),
      citation: { id: "example2026", type: "book", title: "A source" },
    };
    const result = replaceLibrarySource(
      {
        status: "ready",
        value: {
          collectionName: "Reading",
          connectionState: "connected",
          sources: [original],
          sourceIndex: { loaded: 1, total: 1, complete: true },
        },
      },
      replacement,
    );

    expect(result).toMatchObject({
      status: "ready",
      value: {
        sources: [replacement],
        sourceIndex: { loaded: 1, total: 1, complete: true },
      },
    });
  });

  it("does not invent a source while a partial library snapshot has not loaded it", () => {
    const current = {
      status: "ready" as const,
      value: {
        collectionName: "Reading",
        connectionState: "connected" as const,
        sources: [],
        sourceIndex: { loaded: 0, total: 1, complete: false },
      },
    };

    expect(replaceLibrarySource(current, original)).toBe(current);
  });
});

import { collectionId, recordRevision, sourceId, type Source } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { replaceLibrarySource, retainedSourceSelection } from "./use-library-selection.js";

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

describe("startup source selection", () => {
  const partial = {
    collectionName: "Reading",
    connectionState: "connected" as const,
    sources: [],
    sourceIndex: { loaded: 0, complete: false },
  };
  it("does not auto-hydrate the first library row", () => {
    expect(retainedSourceSelection(null, { ...partial, sources: [original] })).toBeNull();
  });
  it("retains a requested source missing from a partial page", () => {
    expect(retainedSourceSelection(original.id, partial)).toBe(original.id);
  });
  it("clears a source only when the completed index proves it absent", () => {
    expect(
      retainedSourceSelection(original.id, {
        ...partial,
        sourceIndex: { loaded: 0, complete: true },
      }),
    ).toBeNull();
  });
});

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

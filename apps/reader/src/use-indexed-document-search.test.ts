import { collectionId, fileId, fileRevision, sourceId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { mergeLibraryDocumentMatches } from "./use-indexed-document-search.js";

import type { SourceSummary } from "@mdbase-reader/core";

const revision = `sha256:${"a".repeat(64)}`;
const source: SourceSummary = {
  id: sourceId("source"),
  collectionId: collectionId("collection"),
  path: "source.md",
  title: "A source",
  kind: "article",
  creators: [],
  tags: [],
  documents: [
    {
      fileId: fileId("file"),
      file: "page.html",
      revision: fileRevision(revision),
      mediaType: "text/html",
      role: "primary",
    },
  ],
};
const excerpt = { before: "", match: "needle", after: "" };

describe("index + open document result merge", () => {
  it("deduplicates sources and retains the file and snippet", () => {
    const matches = mergeLibraryDocumentMatches(
      [source],
      [
        { fileId: "file", revision, excerpt },
        { fileId: "file", revision, excerpt },
      ],
      new Map([[source.id, excerpt]]),
    );
    expect([...matches]).toEqual([[source.id, { file: "page.html", excerpt }]]);
  });

  it("never displays deleted files or stale revisions while reconciliation is pending", () => {
    expect(
      mergeLibraryDocumentMatches(
        [source],
        [{ fileId: "file", revision: "old", excerpt }],
        new Map(),
      ).size,
    ).toBe(0);
    expect(
      mergeLibraryDocumentMatches([], [{ fileId: "file", revision, excerpt }], new Map()).size,
    ).toBe(0);
  });

  it("preserves loaded-document fallback when the index is unavailable", () => {
    expect(
      mergeLibraryDocumentMatches([source], [], new Map([[source.id, excerpt]])).get(source.id)
        ?.excerpt,
    ).toEqual(excerpt);
  });
});

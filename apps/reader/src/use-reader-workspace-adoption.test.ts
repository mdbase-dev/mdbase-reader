import {
  collectionId,
  fileId,
  fileRevision,
  recordRevision,
  sourceId,
  type Source,
} from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { adoptingWrites } from "./use-reader-workspace.js";

const before: Source = {
  collectionId: collectionId("reading"),
  id: sourceId("source-1"),
  path: "sources/source-1.md",
  recordRevision: recordRevision("record-1"),
  title: "Crime and punishment",
  creators: [],
  tags: [],
  documents: [],
  body: "",
  frontmatter: {},
};

const after: Source = {
  ...before,
  recordRevision: recordRevision("record-2"),
  documents: [
    {
      fileId: fileId("file-1"),
      file: "[[files/reader/source-1/dostoevsky.pdf]]",
      revision: fileRevision(`sha256:${"a".repeat(64)}`),
      mediaType: "application/pdf",
      role: "primary",
    },
  ],
};

describe("writes made outside the source panel", () => {
  it("replace the open source record so a newly attached document can be annotated", async () => {
    const adoptSource = vi.fn();
    const writes = adoptingWrites(
      {
        attachSourceFile: vi.fn(() => Promise.resolve(after)),
        saveNewSourceCitation: vi.fn(() => Promise.resolve(after)),
      },
      adoptSource,
    );

    await writes.attachSourceFile?.({
      source: before,
      name: "dostoevsky.pdf",
      bytes: new Uint8Array(),
    });
    await writes.saveNewSourceCitation?.(before, { type: "book" });

    expect(adoptSource).toHaveBeenNthCalledWith(1, after);
    expect(adoptSource).toHaveBeenNthCalledWith(2, after);
  });

  it("stay absent when the collection cannot make them", () => {
    expect(adoptingWrites({}, vi.fn())).toEqual({});
  });
});

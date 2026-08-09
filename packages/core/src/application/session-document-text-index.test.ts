import { describe, expect, it } from "vitest";

import { fileId, sourceId } from "../domain/identity.js";
import { fileRevision } from "../domain/revision.js";

import { SessionDocumentTextIndex } from "./session-document-text-index.js";

const firstDocument = {
  fileId: fileId("file_01"),
  file: "[[files/first.pdf]]",
  revision: fileRevision(`sha256:${"1".repeat(64)}`),
};

describe("SessionDocumentTextIndex", () => {
  it("finds extracted document text without retaining canonical content elsewhere", () => {
    const index = new SessionDocumentTextIndex();
    const source = sourceId("src_01");
    index.add(source, firstDocument, "Attention changes what can be perceived.");

    expect(index.search("WHAT CAN BE")).toEqual([{ sourceId: source, kinds: ["document"] }]);
    expect(index.search("missing")).toEqual([]);
  });

  it("keys entries by document revision", () => {
    const index = new SessionDocumentTextIndex();
    const source = sourceId("src_01");
    index.add(source, firstDocument, "old text");
    const revised = { ...firstDocument, revision: fileRevision(`sha256:${"2".repeat(64)}`) };

    expect(index.has(source, firstDocument)).toBe(true);
    expect(index.has(source, revised)).toBe(false);

    index.add(source, revised, "new text");
    expect(index.has(source, firstDocument)).toBe(false);
    expect(index.search("old text")).toEqual([]);
    expect(index.search("new text")).toEqual([{ sourceId: source, kinds: ["document"] }]);
  });

  it("evicts the least recently added documents to stay within its memory budget", () => {
    const index = new SessionDocumentTextIndex(12);
    const first = sourceId("src_01");
    const second = sourceId("src_02");
    index.add(first, firstDocument, "first text");
    index.add(second, { ...firstDocument, fileId: fileId("file_02") }, "second text");

    expect(index.search("first")).toEqual([]);
    expect(index.search("second")).toEqual([{ sourceId: second, kinds: ["document"] }]);
  });

  it("clears all session content", () => {
    const index = new SessionDocumentTextIndex();
    index.add(sourceId("src_01"), firstDocument, "private text");
    index.clear();
    expect(index.search("private")).toEqual([]);
  });
});

import {
  collectionId,
  fileId,
  fileRevision,
  recordRevision,
  sourceId,
  type AnnotationRepository,
  type Source,
  type SourceRepository,
  type SourceImportRepository,
} from "@mdbase-reader/core";
import { createReaderRuntimeServices, MemoryStorage } from "@mdbase-reader/platform";
import { describe, expect, it, vi } from "vitest";

import { ConnectWorkspaceGateway } from "./connect-workspace.js";
import { PreviewGateway } from "./preview.js";

async function anthology(gateway: PreviewGateway): Promise<{ book: Source; chapter: Source }> {
  const book = await gateway.source(sourceId("src_anthology"));
  const chapter = await gateway.source(sourceId("src_anthology_chapter_1"));
  return { book: book!, chapter: chapter! };
}

describe("preview source parts", () => {
  it("offers one book and two chapters sharing a revisioned PDF", async () => {
    const gateway = new PreviewGateway();
    const { book, chapter } = await anthology(gateway);
    const parts = await gateway.sourceParts(book.id);
    expect(parts).toHaveLength(2);
    expect(parts.every((part) => part.documents[0]?.fileId === book.documents[0]?.fileId)).toBe(
      true,
    );
    expect(parts.every((part) => part.documents[0]?.revision === book.documents[0]?.revision)).toBe(
      true,
    );
    expect(chapter.documents[0]?.range).toEqual({ kind: "pages", start: 0, end: 9 });
    expect(chapter.frontmatter["relations"]).toEqual([
      { relation: "part-of", target: "[[sources/anthology|An anthology of attention]]" },
    ]);
  });
  it("guards range writes and parent writes, rejects cycles, and supports clearing", async () => {
    const gateway = new PreviewGateway();
    const { book, chapter } = await anthology(gateway);
    const document = chapter.documents[0]!;
    await expect(gateway.setSourcePartOf(book, chapter.id)).rejects.toThrow(/cycle/u);
    await expect(gateway.setSourcePartOf(book, book.id)).rejects.toThrow(/self-reference/u);
    await expect(
      gateway.setDocumentRange(chapter, document.fileId, fileRevision("sha256:bbbbbb"), null),
    ).rejects.toThrow(/revision changed/u);
    const saved = await gateway.setDocumentRange(chapter, document.fileId, document.revision, {
      kind: "pages",
      start: 1,
      end: 5,
    });
    expect(saved.documents[0]?.range).toEqual({ kind: "pages", start: 1, end: 5 });
    await expect(gateway.setSourcePartOf(chapter, null)).rejects.toThrow(
      /Source revision changed/u,
    );
    const clearedRange = await gateway.setDocumentRange(
      saved,
      document.fileId,
      document.revision,
      null,
    );
    expect(clearedRange.documents[0]?.range).toBeUndefined();
    const cleared = await gateway.setSourcePartOf(clearedRange, null);
    expect(cleared.partOf).toBeUndefined();
    expect(await gateway.sourceParts(book.id)).toHaveLength(1);
    expect(cleared.frontmatter["relations"]).toBeUndefined();
  });
});

describe("Connect workspace source part surface", () => {
  it("forwards revision guards and updates source and library caches", async () => {
    const source: Source = {
      collectionId: collectionId("parts"),
      id: sourceId("child"),
      path: "sources/child.md",
      title: "Child",
      creators: [],
      tags: [],
      documents: [],
      body: "",
      frontmatter: {},
      recordRevision: recordRevision("rev-1"),
    };
    const parentId = sourceId("parent");
    const saved = { ...source, partOf: parentId, recordRevision: recordRevision("rev-2") };
    const sourceParts = vi.fn().mockResolvedValue([saved]);
    const setSourcePartOf = vi.fn().mockResolvedValue(saved);
    const setDocumentRange = vi.fn().mockResolvedValue(saved);
    const gateway = new ConnectWorkspaceGateway(
      {
        list: vi.fn().mockResolvedValue({ items: [source] }),
        get: vi.fn().mockResolvedValue(source),
        sourceParts,
        setSourcePartOf,
        setDocumentRange,
      } as unknown as SourceRepository,
      {} as AnnotationRepository,
      { store: vi.fn() },
      {} as SourceImportRepository,
      source.collectionId,
      "Parts",
      createReaderRuntimeServices(new MemoryStorage()),
    );
    await gateway.library();
    const controller = new AbortController();
    expect(await gateway.sourceParts(parentId, { signal: controller.signal })).toEqual([saved]);
    expect(sourceParts).toHaveBeenCalledWith(source.collectionId, parentId, {
      signal: controller.signal,
    });
    await gateway.setSourcePartOf(source, parentId);
    expect(setSourcePartOf).toHaveBeenCalledWith({
      collectionId: source.collectionId,
      sourceId: source.id,
      expectedRevision: "rev-1",
      parentId,
    });
    expect(await gateway.source(source.id)).toBe(saved);
    expect((await gateway.library()).sources[0]?.partOf).toBe(parentId);
    await gateway.setDocumentRange(saved, fileId("file"), fileRevision("sha256:aaaaaa"), null);
    expect(setDocumentRange).toHaveBeenCalledWith({
      collectionId: source.collectionId,
      sourceId: source.id,
      expectedRevision: "rev-2",
      documentFileId: "file",
      expectedDocumentRevision: "sha256:aaaaaa",
      range: null,
    });
  });
});

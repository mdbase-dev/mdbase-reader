import {
  annotationId,
  collectionId,
  dateTime,
  fileId,
  fileRevision,
  recordRevision,
  sourceId,
  type AnnotationRepository,
  type Annotation,
  type Source,
  type SourceRepository,
  type SourceImportRepository,
} from "@mdbase-reader/core";
import { createReaderRuntimeServices, MemoryStorage } from "@mdbase-reader/platform";
import { describe, expect, it, vi } from "vitest";

import { ConnectWorkspaceGateway } from "./connect-workspace.js";

const source: Source = {
  collectionId: collectionId("reading"),
  id: sourceId("src_01"),
  path: "sources/example.md",
  title: "Example",
  creators: [],
  tags: [],
  documents: [],
  body: "Original",
  recordRevision: recordRevision("rev-1"),
  frontmatter: {},
};

const annotation: Annotation = {
  collectionId: source.collectionId,
  id: annotationId("ann_01"),
  path: "annotations/ann_01.md",
  recordRevision: recordRevision("rev-1"),
  sourceId: source.id,
  source: "[[src_01]]",
  annotationType: "note",
  tags: [],
  body: "A note",
  createdAt: dateTime("2026-08-09T00:00:00Z"),
};

describe("ConnectWorkspaceGateway", () => {
  it("loads summaries before source bodies and saves notes revision-safely", async () => {
    const controller = new AbortController();
    const updateBody = vi.fn().mockResolvedValue({ ...source, body: "Updated" });
    const list = vi.fn().mockResolvedValue({ items: [source] });
    const get = vi.fn().mockResolvedValue(source);
    const sources = {
      list,
      get,
      updateBody,
    } as unknown as SourceRepository;
    const listForSource = vi.fn().mockResolvedValue([]);
    const annotations = {
      listForSource,
    } as unknown as AnnotationRepository;
    const gateway = new ConnectWorkspaceGateway(
      sources,
      annotations,
      { store: vi.fn() },
      emptyImports(),
      source.collectionId,
      "Reading",
      createReaderRuntimeServices(new MemoryStorage()),
    );

    const library = await gateway.library({ signal: controller.signal });
    expect(library.sources[0]?.id).toBe(source.id);
    expect(await gateway.source(source.id, { signal: controller.signal })).toBe(source);
    expect(await gateway.annotations(source.id, { signal: controller.signal })).toEqual([]);
    expect(await gateway.saveSourceBody(source, "Updated")).toMatchObject({ body: "Updated" });
    expect(list).toHaveBeenCalledOnce();
    expect(list).toHaveBeenCalledWith(
      { collectionId: source.collectionId, limit: 100 },
      { signal: controller.signal },
    );
    expect(get).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith(source.collectionId, source.id, {
      signal: controller.signal,
    });
    expect(listForSource).toHaveBeenCalledOnce();
    expect(listForSource).toHaveBeenCalledWith(source.collectionId, source.id, {
      signal: controller.signal,
    });
    expect(updateBody).toHaveBeenCalledWith({
      collectionId: source.collectionId,
      sourceId: source.id,
      expectedRevision: source.recordRevision,
      body: "Updated",
    });
  });

  it("saves valid citation metadata and refreshes the warm library", async () => {
    const citation = { id: "example2026", type: "article", title: "Example" };
    const updateCitation = vi.fn().mockResolvedValue({ ...source, citation });
    const gateway = new ConnectWorkspaceGateway(
      {
        list: vi.fn().mockResolvedValue({ items: [source] }),
        updateCitation,
      } as unknown as SourceRepository,
      { listForSource: vi.fn() } as unknown as AnnotationRepository,
      { store: vi.fn() },
      emptyImports(),
      source.collectionId,
      "Reading",
      createReaderRuntimeServices(new MemoryStorage()),
    );
    await gateway.library();

    const updated = await gateway.saveSourceCitation(source, citation);

    expect(updateCitation).toHaveBeenCalledWith({
      collectionId: source.collectionId,
      sourceId: source.id,
      expectedRevision: source.recordRevision,
      citation,
    });
    expect(updated.citation).toEqual(citation);
    expect((await gateway.library()).sources[0]?.citation).toEqual(citation);
  });

  it("searches note text within the connected collection", async () => {
    const controller = new AbortController();
    const search = vi.fn().mockResolvedValue([{ sourceId: source.id, kinds: ["annotation"] }]);
    const gateway = new ConnectWorkspaceGateway(
      { list: vi.fn() } as unknown as SourceRepository,
      { listForSource: vi.fn() } as unknown as AnnotationRepository,
      { store: vi.fn() },
      emptyImports(),
      source.collectionId,
      "Reading",
      createReaderRuntimeServices(new MemoryStorage()),
      { search },
    );

    await expect(
      gateway.searchText("cannot be measured", { signal: controller.signal }),
    ).resolves.toEqual([{ sourceId: source.id, kinds: ["annotation"] }]);
    expect(search).toHaveBeenCalledWith(source.collectionId, "cannot be measured", {
      signal: controller.signal,
    });
  });

  it("transcludes an annotation and refreshes the source cache", async () => {
    const updated = { ...source, body: "Original\n\n![[annotations/ann_01]]\n" };
    const appendAnnotationEmbed = vi.fn().mockResolvedValue(recordRevision("rev-2"));
    const get = vi.fn().mockResolvedValue(updated);
    const gateway = new ConnectWorkspaceGateway(
      { appendAnnotationEmbed, get } as unknown as SourceRepository,
      { listForSource: vi.fn() } as unknown as AnnotationRepository,
      { store: vi.fn() },
      emptyImports(),
      source.collectionId,
      "Reading",
      createReaderRuntimeServices(new MemoryStorage()),
    );

    await expect(gateway.transcludeAnnotation(source, annotation)).resolves.toBe(updated);
    expect(appendAnnotationEmbed).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: source.id,
        annotationId: annotation.id,
        embed: "![[annotations/ann_01]]",
      }),
    );
    expect(await gateway.source(source.id)).toBe(updated);
    expect(get).toHaveBeenCalledOnce();
  });
});

describe("ConnectWorkspaceGateway pagination", () => {
  it("follows contract-query cursors so sources beyond the authority page cap remain visible", async () => {
    const pageTwo = { ...source, id: sourceId("src_101"), title: "Page two" };
    const pageThree = { ...source, id: sourceId("src_201"), title: "Page three" };
    const list = vi.fn((query: { readonly cursor?: string }) => {
      if (query.cursor === "100") {
        return Promise.resolve({ items: [pageTwo], totalCount: 201 });
      }
      if (query.cursor === "200") {
        return Promise.resolve({ items: [pageThree], totalCount: 201 });
      }
      return Promise.resolve({ items: [source], nextCursor: "100", totalCount: 201 });
    });
    const gateway = new ConnectWorkspaceGateway(
      { list } as unknown as SourceRepository,
      { listForSource: vi.fn() } as unknown as AnnotationRepository,
      { store: vi.fn() },
      emptyImports(),
      source.collectionId,
      "Reading",
      createReaderRuntimeServices(new MemoryStorage()),
    );

    expect((await gateway.library()).sources.map(({ id }) => id)).toEqual([
      "src_01",
      "src_101",
      "src_201",
    ]);
    expect(list).toHaveBeenNthCalledWith(
      2,
      { collectionId: source.collectionId, limit: 100, cursor: "100" },
      {},
    );
    expect(list).toHaveBeenNthCalledWith(
      3,
      { collectionId: source.collectionId, limit: 100, cursor: "200" },
      {},
    );
  });
});

describe("ConnectWorkspaceGateway imports", () => {
  it("validates a stale-positive warm library against authority before importing", async () => {
    const digest = `sha256:${"a".repeat(64)}` as const;
    const cachedDuplicate = {
      ...source,
      documents: [
        {
          fileId: fileId("file-cached"),
          file: "files/cached.pdf",
          role: "primary" as const,
          mediaType: "application/pdf",
          revision: fileRevision(digest),
        },
      ],
    };
    const imported = {
      ...source,
      id: sourceId("src_imported"),
      path: "sources/src_imported.md",
      title: "Imported paper",
    };
    const findExactDuplicate = vi.fn().mockResolvedValue(null);
    const commitFile = vi.fn().mockResolvedValue(imported);
    const runtime = {
      ...createReaderRuntimeServices(new MemoryStorage()),
      hasher: { sha256: vi.fn().mockResolvedValue(digest) },
    };
    const gateway = new ConnectWorkspaceGateway(
      {
        list: vi.fn().mockResolvedValue({ items: [cachedDuplicate] }),
      } as unknown as SourceRepository,
      { listForSource: vi.fn() } as unknown as AnnotationRepository,
      { store: vi.fn() },
      { findExactDuplicate, commitFile },
      source.collectionId,
      "Reading",
      runtime,
    );
    await gateway.library();

    const result = await gateway.importSourceFile({
      name: "paper.pdf",
      bytes: new TextEncoder().encode("%PDF-1.7\nfixture"),
      title: "Imported paper",
    });

    expect(result).toBe(imported);
    expect(findExactDuplicate).toHaveBeenCalledWith(source.collectionId, [digest], {});
    expect(commitFile).toHaveBeenCalledOnce();
    expect((await gateway.library()).sources.map(({ id }) => id)).toEqual([
      "src_imported",
      "src_01",
    ]);
    expect(await gateway.source(imported.id)).toBe(imported);
  });
});

function emptyImports(): SourceImportRepository {
  return {
    findExactDuplicate: vi.fn().mockResolvedValue(null),
    commitFile: vi.fn(),
  };
}

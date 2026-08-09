import {
  collectionId,
  recordRevision,
  sourceId,
  type AnnotationRepository,
  type Source,
  type SourceRepository,
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
});

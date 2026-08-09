import {
  collectionId,
  recordRevision,
  sourceId,
  type AnnotationRepository,
  type Source,
  type SourceRepository,
} from "@mdbase-reader/core";
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
      source.collectionId,
      "Reading",
    );

    const snapshot = await gateway.snapshot();
    expect(snapshot.selectedSource?.id).toBe(source.id);
    await gateway.selectSource(source.id);
    await gateway.saveSourceBody(source, "Updated");
    expect(list).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledOnce();
    expect(listForSource).toHaveBeenCalledOnce();
    expect(updateBody).toHaveBeenCalledWith({
      collectionId: source.collectionId,
      sourceId: source.id,
      expectedRevision: source.recordRevision,
      body: "Updated",
    });
  });
});

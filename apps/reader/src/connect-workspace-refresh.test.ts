import {
  collectionId,
  sourceId,
  recordRevision,
  type Source,
  type SourceRepository,
  type SourceImportRepository,
  type AnnotationRepository,
} from "@mdbase-reader/core";
import { createReaderRuntimeServices, MemoryStorage } from "@mdbase-reader/platform";
import { expect, it, vi } from "vitest";

import { ConnectWorkspaceGateway } from "./connect-workspace.js";

it("bypasses warm source caches for draft conflict checks and retains the fresh revision", async () => {
  const source: Source = {
    collectionId: collectionId("test"),
    id: sourceId("test"),
    path: "test.md",
    title: "Test",
    creators: [],
    tags: [],
    documents: [],
    body: "Original",
    recordRevision: recordRevision("1"),
    frontmatter: {},
  };
  const updated = { ...source, body: "External change", recordRevision: recordRevision("2") };
  const get = vi
    .fn()
    .mockResolvedValueOnce(source)
    .mockResolvedValueOnce(updated)
    .mockResolvedValueOnce(null);
  const gateway = new ConnectWorkspaceGateway(
    { get, list: vi.fn().mockResolvedValue({ items: [source] }) } as unknown as SourceRepository,
    {} as AnnotationRepository,
    { store: vi.fn() },
    {} as SourceImportRepository,
    source.collectionId,
    "Test",
    createReaderRuntimeServices(new MemoryStorage()),
  );
  await gateway.library();
  expect(await gateway.source(source.id)).toBe(source);
  expect(await gateway.source(source.id)).toBe(source);
  expect(get).toHaveBeenCalledTimes(1);
  expect(await gateway.refreshSource(source.id)).toBe(updated);
  expect(await gateway.source(source.id)).toBe(updated);
  expect((await gateway.library()).sources[0]).toBe(updated);
  expect(await gateway.refreshSource(source.id)).toBeNull();
  expect(get).toHaveBeenCalledTimes(3);
});

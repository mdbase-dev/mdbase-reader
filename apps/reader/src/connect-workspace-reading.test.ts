import {
  collectionId,
  fileId,
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

describe("ConnectWorkspaceGateway reading position", () => {
  it("saves against the newest revision even when the caller holds the opening copy", async () => {
    const saved = {
      ...source,
      recordRevision: recordRevision("rev-2"),
      frontmatter: { reading: { status: "reading" } },
    };
    const updateReading = vi
      .fn()
      .mockResolvedValueOnce(saved)
      .mockResolvedValueOnce({ ...saved, recordRevision: recordRevision("rev-3") });
    const gateway = new ConnectWorkspaceGateway(
      { get: vi.fn().mockResolvedValue(source), updateReading } as unknown as SourceRepository,
      { listForSource: vi.fn() } as unknown as AnnotationRepository,
      { store: vi.fn() },
      { findExactDuplicate: vi.fn().mockResolvedValue(null), commitFile: vi.fn() },
      source.collectionId,
      "Reading",
      createReaderRuntimeServices(new MemoryStorage()),
    );
    const opened = await gateway.source(source.id);
    if (!opened) {
      throw new Error("The source should open.");
    }
    const position = { kind: "pdf", pageIndex: 1 } as const;

    await gateway.saveReadingPosition(opened, fileId("file-01"), position);
    await gateway.saveReadingPosition(opened, fileId("file-01"), position);

    expect(updateReading).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedRevision: "rev-2",
        expectedFrontmatter: saved.frontmatter,
      }),
    );
  });
});

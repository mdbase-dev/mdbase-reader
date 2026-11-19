import {
  collectionId,
  fileId,
  fileRevision,
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
  it("publishes the freshly saved source even when the caller holds the opening copy", async () => {
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
    const document = {
      fileId: fileId("file-01"),
      file: "[[files/file-01.pdf]]",
      revision: fileRevision(`sha256:${"a".repeat(64)}`),
    };

    await gateway.saveReadingPosition(opened, document, position);
    const latest = await gateway.saveReadingPosition(opened, document, position);

    expect(latest.recordRevision).toBe("rev-3");
    expect(await gateway.source(source.id)).toBe(latest);
  });
});

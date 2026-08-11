import {
  annotationId,
  collectionId,
  dateTime,
  recordRevision,
  sourceId,
  type Annotation,
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

describe("ConnectWorkspaceGateway annotation mutations", () => {
  it("updates an annotation and refreshes its source cache", async () => {
    const updated = {
      ...annotation,
      body: "Revised note",
      recordRevision: recordRevision("rev-2"),
    };
    const updateBody = vi.fn().mockResolvedValue(updated);
    const { gateway, listForSource } = annotationGateway({ updateBody });
    await gateway.annotations(source.id);

    await expect(gateway.updateAnnotation(annotation, updated.body)).resolves.toBe(updated);
    expect(updateBody).toHaveBeenCalledWith(
      expect.objectContaining({ annotation, body: updated.body }),
    );
    await expect(gateway.annotations(source.id)).resolves.toEqual([updated]);
    expect(listForSource).toHaveBeenCalledOnce();
  });

  it("preflights and removes an annotation from the warm cache", async () => {
    const plan = {
      annotationId: annotation.id,
      path: annotation.path ?? "",
      expectedRevision: annotation.recordRevision ?? recordRevision("missing"),
      brokenLinkPaths: [source.path],
    };
    const preflightDelete = vi.fn().mockResolvedValue(plan);
    const remove = vi.fn().mockResolvedValue(undefined);
    const { gateway, listForSource } = annotationGateway({
      preflightDelete,
      delete: remove,
    });
    await gateway.annotations(source.id);

    await expect(gateway.planAnnotationDeletion(annotation)).resolves.toBe(plan);
    await gateway.deleteAnnotation(annotation, plan);

    expect(remove).toHaveBeenCalledWith(annotation, plan);
    await expect(gateway.annotations(source.id)).resolves.toEqual([]);
    expect(listForSource).toHaveBeenCalledOnce();
  });
});

function annotationGateway(repository: Partial<AnnotationRepository>): {
  readonly gateway: ConnectWorkspaceGateway;
  readonly listForSource: ReturnType<typeof vi.fn>;
} {
  const listForSource = vi.fn().mockResolvedValue([annotation]);
  return {
    listForSource,
    gateway: new ConnectWorkspaceGateway(
      { get: vi.fn() } as unknown as SourceRepository,
      { listForSource, ...repository } as unknown as AnnotationRepository,
      { store: vi.fn() },
      { findExactDuplicate: vi.fn().mockResolvedValue(null), commitFile: vi.fn() },
      source.collectionId,
      "Reading",
      createReaderRuntimeServices(new MemoryStorage()),
    ),
  };
}

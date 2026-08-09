import { describe, expect, it, vi } from "vitest";

import {
  annotationId,
  collectionId,
  dateTime,
  deleteAnnotation,
  planAnnotationDeletion,
  recordRevision,
  sourceId,
  type Annotation,
  type AnnotationDeletionPlan,
  type AnnotationRepository,
} from "../index.js";

const annotation: Annotation = {
  collectionId: collectionId("reading"),
  id: annotationId("ann_01"),
  path: "annotations/ann_01.md",
  recordRevision: recordRevision("rev-1"),
  sourceId: sourceId("src_01"),
  source: "[[src_01]]",
  annotationType: "note",
  tags: [],
  body: "A note.",
  createdAt: dateTime("2026-08-09T00:00:00Z"),
};
const plan: AnnotationDeletionPlan = {
  annotationId: annotation.id,
  path: annotation.path ?? "",
  expectedRevision: annotation.recordRevision ?? recordRevision("missing"),
  brokenLinkPaths: ["sources/src_01.md"],
};

describe("annotation deletion", () => {
  it("preflights the canonical revision and returns inbound links", async () => {
    const preflightDelete = vi.fn().mockResolvedValue(plan);
    const repository = { preflightDelete } as unknown as AnnotationRepository;

    await expect(planAnnotationDeletion(repository, annotation)).resolves.toBe(plan);
    expect(preflightDelete).toHaveBeenCalledWith(annotation);
  });

  it("deletes only with a plan for the same canonical revision", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const repository = { delete: remove } as unknown as AnnotationRepository;

    await deleteAnnotation(repository, annotation, plan);
    expect(remove).toHaveBeenCalledWith(annotation, plan);

    await expect(
      deleteAnnotation(repository, annotation, {
        ...plan,
        expectedRevision: recordRevision("rev-older"),
      }),
    ).rejects.toThrow("no longer matches");
    expect(remove).toHaveBeenCalledOnce();
  });
});

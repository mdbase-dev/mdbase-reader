import { describe, expect, it, vi } from "vitest";

import {
  annotationId,
  collectionId,
  dateTime,
  recordRevision,
  sourceId,
  updateAnnotationBody,
  type Annotation,
  type AnnotationRepository,
} from "../index.js";

const annotation: Annotation = {
  collectionId: collectionId("reading"),
  id: annotationId("ann_01"),
  path: "annotations/ann_01.md",
  recordRevision: recordRevision("rev-1"),
  sourceId: sourceId("src_01"),
  source: "[[src_01]]",
  annotationType: "highlight",
  target: { quote: { exact: "Selected text" } },
  tags: [],
  body: "> Selected text\n\nOriginal note.",
  createdAt: dateTime("2026-08-09T00:00:00Z"),
};

describe("updateAnnotationBody", () => {
  it("delegates an explicit body edit without changing selector evidence", async () => {
    const updated = {
      ...annotation,
      body: "> Selected text\n\nRevised note.",
      modifiedAt: dateTime("2026-08-10T00:00:00Z"),
    };
    const updateBody = vi.fn().mockResolvedValue(updated);
    const repository = { updateBody } as unknown as AnnotationRepository;

    await expect(
      updateAnnotationBody(repository, annotation, updated.body, updated.modifiedAt),
    ).resolves.toBe(updated);
    expect(updateBody).toHaveBeenCalledWith({
      annotation,
      body: updated.body,
      modifiedAt: updated.modifiedAt,
    });
    expect(updated.target).toBe(annotation.target);
  });

  it("rejects projected annotations that lack whole-record identity", async () => {
    const updateBody = vi.fn();
    const repository = { updateBody } as unknown as AnnotationRepository;
    const { path, ...projected } = annotation;
    expect(path).toBe("annotations/ann_01.md");

    await expect(
      updateAnnotationBody(repository, projected, "Revised", dateTime("2026-08-10T00:00:00Z")),
    ).rejects.toThrow("canonical path and revision");
    expect(updateBody).not.toHaveBeenCalled();
  });
});

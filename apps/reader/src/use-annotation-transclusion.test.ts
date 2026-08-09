import {
  annotationId,
  collectionId,
  dateTime,
  recordRevision,
  sourceId,
  type Annotation,
  type Source,
} from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { persistAnnotationTransclusion } from "./use-annotation-transclusion.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";

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
  sourceId: source.id,
  source: "[[src_01]]",
  annotationType: "note",
  tags: [],
  body: "A note",
  createdAt: dateTime("2026-08-09T00:00:00Z"),
};

describe("persistAnnotationTransclusion", () => {
  it("saves a dirty draft before inserting against its new revision", async () => {
    const saved = { ...source, body: "Draft", recordRevision: recordRevision("rev-2") };
    const final = { ...saved, body: "Draft\n\n![[annotations/ann_01]]\n" };
    const saveSourceBody = vi.fn().mockResolvedValue(saved);
    const transcludeAnnotation = vi.fn().mockResolvedValue(final);
    const gateway = { saveSourceBody, transcludeAnnotation } as unknown as ReaderWorkspaceGateway;

    await expect(persistAnnotationTransclusion(gateway, source, "Draft", annotation)).resolves.toBe(
      final,
    );
    expect(saveSourceBody).toHaveBeenCalledWith(source, "Draft");
    expect(transcludeAnnotation).toHaveBeenCalledWith(saved, annotation);
    expect(saveSourceBody.mock.invocationCallOrder[0]).toBeLessThan(
      transcludeAnnotation.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("does not rewrite an unchanged source before inserting", async () => {
    const transcludeAnnotation = vi.fn().mockResolvedValue(source);
    const saveSourceBody = vi.fn();
    const gateway = { saveSourceBody, transcludeAnnotation } as unknown as ReaderWorkspaceGateway;

    await persistAnnotationTransclusion(gateway, source, source.body, annotation);

    expect(saveSourceBody).not.toHaveBeenCalled();
    expect(transcludeAnnotation).toHaveBeenCalledWith(source, annotation);
  });
});

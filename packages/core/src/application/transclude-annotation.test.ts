import { describe, expect, it, vi } from "vitest";

import {
  annotationId,
  collectionId,
  dateTime,
  mutationId,
  recordRevision,
  sourceId,
  transcludeAnnotation,
  type Annotation,
  type Source,
  type SourceRepository,
} from "../index.js";

const source: Source = {
  collectionId: collectionId("reading"),
  id: sourceId("src_01"),
  path: "sources/example.md",
  title: "Example",
  creators: [],
  tags: [],
  documents: [],
  body: "# Notes\n",
  recordRevision: recordRevision("rev-1"),
  frontmatter: {},
};

const annotation: Annotation = {
  collectionId: source.collectionId,
  id: annotationId("ann_01"),
  path: "annotations/custom-name.md",
  sourceId: source.id,
  source: "[[src_01]]",
  annotationType: "note",
  tags: [],
  body: "A note",
  createdAt: dateTime("2026-08-09T00:00:00Z"),
};

describe("transcludeAnnotation", () => {
  it("inserts the canonical path revision-safely and returns the refreshed source", async () => {
    const updated = { ...source, body: "# Notes\n\n![[annotations/custom-name]]\n" };
    const appendAnnotationEmbed = vi.fn().mockResolvedValue(recordRevision("rev-2"));
    const get = vi.fn().mockResolvedValue(updated);
    const repository = { appendAnnotationEmbed, get } as unknown as SourceRepository;

    await expect(
      transcludeAnnotation(repository, source, annotation, mutationId("mut-1")),
    ).resolves.toBe(updated);
    expect(appendAnnotationEmbed).toHaveBeenCalledWith({
      collectionId: source.collectionId,
      sourceId: source.id,
      expectedRevision: source.recordRevision,
      annotationId: annotation.id,
      embed: "![[annotations/custom-name]]",
      idempotencyKey: "mut-1",
    });
  });

  it("rejects cross-source insertion before writing", async () => {
    const appendAnnotationEmbed = vi.fn();
    const repository = { appendAnnotationEmbed } as unknown as SourceRepository;

    await expect(
      transcludeAnnotation(
        repository,
        source,
        { ...annotation, sourceId: sourceId("src_other") },
        mutationId("mut-1"),
      ),
    ).rejects.toThrow("originating source note");
    expect(appendAnnotationEmbed).not.toHaveBeenCalled();
  });
});

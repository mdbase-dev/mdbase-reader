import {
  annotationId,
  collectionId,
  dateTime,
  recordRevision,
  sourceId,
  type Annotation,
} from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectAnnotationRepository } from "./annotation-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";

const annotation: Annotation = {
  id: annotationId("ann"),
  collectionId: collectionId("reading"),
  sourceId: sourceId("book"),
  source: "[[sources/book]]",
  path: "annotations/a.md",
  recordRevision: recordRevision("ann-rev"),
  target: { quote: { exact: "Keep selector" } },
  annotationType: "highlight",
  color: "yellow",
  body: "> Keep quotation\n\nKeep body",
  tags: ["keep"],
  createdAt: dateTime("2026-01-01T00:00:00Z"),
};
const modifiedAt = dateTime("2026-01-02T00:00:00Z");

describe("guarded annotation colour writes", () => {
  it("patches only the colour and modification time, never the note or target", async () => {
    const fields = {
      id: annotation.id,
      source: annotation.source,
      annotation_type: annotation.annotationType,
      color: "green",
      target: annotation.target,
      tags: annotation.tags,
      created_at: annotation.createdAt,
    };
    const update = vi.fn().mockResolvedValue({
      ok: true,
      diagnostics: [],
      value: {
        path: annotation.path,
        revision: "ann-new",
        frontmatter: fields,
        effectiveFrontmatter: fields,
        body: annotation.body,
      },
    });
    const repository = new ConnectAnnotationRepository({
      update,
    } as unknown as ReaderConnectClient);
    const recoloured = await repository.updateColor({ annotation, color: "green", modifiedAt });
    expect(update).toHaveBeenCalledExactlyOnceWith({
      path: annotation.path,
      ifRevision: annotation.recordRevision,
      patch: { color: "green", modified_at: modifiedAt },
      includeDocument: true,
    });
    expect(recoloured).toMatchObject({
      id: annotation.id,
      color: "green",
      body: annotation.body,
      target: annotation.target,
      sourceId: annotation.sourceId,
    });
  });

  it("refuses an annotation without a path and revision before writing", async () => {
    const update = vi.fn();
    const repository = new ConnectAnnotationRepository({
      update,
    } as unknown as ReaderConnectClient);
    await expect(
      repository.updateColor({
        annotation: { ...annotation, recordRevision: undefined } as unknown as Annotation,
        color: "blue",
        modifiedAt,
      }),
    ).rejects.toThrow("path and revision");
    expect(update).not.toHaveBeenCalled();
  });
});

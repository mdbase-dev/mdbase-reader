import {
  annotationId,
  collectionId,
  dateTime,
  recordRevision,
  sourceId,
  sourceLink,
  type Annotation,
  type Source,
} from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectAnnotationRepository } from "./annotation-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";

const owner: Source = {
  id: sourceId("chapter"),
  collectionId: collectionId("reading"),
  path: "sources/chapter.md",
  title: "Chapter",
  creators: [],
  documents: [],
  tags: [],
  body: "Keep this note and embeds",
  frontmatter: {},
  recordRevision: recordRevision("source-rev"),
};
const annotation: Annotation = {
  id: annotationId("ann"),
  collectionId: owner.collectionId,
  sourceId: sourceId("book"),
  source: "[[sources/book]]",
  path: "annotations/a.md",
  recordRevision: recordRevision("ann-rev"),
  target: { quote: { exact: "Keep selector" } },
  annotationType: "highlight",
  body: "> Keep quotation\n\nKeep body",
  tags: ["keep"],
  createdAt: dateTime("2026-01-01T00:00:00Z"),
};
const modifiedAt = dateTime("2026-01-02T00:00:00Z");
describe("guarded annotation ownership writes", () => {
  it("patches only source and modification bookkeeping, never the note or target", async () => {
    const fields = {
      id: annotation.id,
      source: sourceLink(owner),
      annotation_type: annotation.annotationType,
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
    const moved = await repository.moveOwner({ annotation, owner, modifiedAt });
    expect(update).toHaveBeenCalledExactlyOnceWith({
      path: annotation.path,
      ifRevision: annotation.recordRevision,
      patch: { source: sourceLink(owner), modified_at: modifiedAt },
      includeDocument: true,
    });
    expect(moved).toMatchObject({
      id: annotation.id,
      sourceId: owner.id,
      body: annotation.body,
      target: annotation.target,
    });
    expect(owner.body).toBe("Keep this note and embeds");
  });
  it("surfaces conflicts without retrying or rebasing ownership", async () => {
    const update = vi.fn().mockRejectedValue(new Error("revision conflict"));
    const repository = new ConnectAnnotationRepository({
      update,
    } as unknown as ReaderConnectClient);
    await expect(repository.moveOwner({ annotation, owner, modifiedAt })).rejects.toThrow(
      "revision conflict",
    );
    expect(update).toHaveBeenCalledTimes(1);
  });
  it("refuses missing guards and cross-collection owners before writing", async () => {
    const update = vi.fn();
    const repository = new ConnectAnnotationRepository({
      update,
    } as unknown as ReaderConnectClient);
    await expect(
      repository.moveOwner({
        annotation: { ...annotation, recordRevision: undefined } as unknown as Annotation,
        owner,
        modifiedAt,
      }),
    ).rejects.toThrow("saved annotation");
    await expect(
      repository.moveOwner({
        annotation,
        owner: { ...owner, collectionId: collectionId("other") },
        modifiedAt,
      }),
    ).rejects.toThrow("same collection");
    expect(update).not.toHaveBeenCalled();
  });
});

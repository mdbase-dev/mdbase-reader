import { annotationId, collectionId, dateTime, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectAnnotationRepository } from "./annotation-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, RecordDocument } from "@mdbase-dev/connect";

function success<Value>(value: Value): ConnectOutcome<Value> {
  return { ok: true, value, diagnostics: [] };
}

describe("ConnectAnnotationRepository updates", () => {
  it("updates only the canonical body and modification time revision-safely", async () => {
    const document = annotationDocument();
    const update = vi.fn(() => Promise.resolve(success(document)));
    const repository = new ConnectAnnotationRepository({
      update,
    } as unknown as ReaderConnectClient);
    const original = {
      collectionId: collectionId("reading"),
      id: annotationId("ann_01"),
      path: document.path,
      recordRevision: "rev-1" as never,
      sourceId: sourceId("src_01"),
      source: "[[src_01]]",
      annotationType: "highlight",
      target: { quote: { exact: "Selected text" } },
      tags: [],
      body: "> Selected text\n\nOriginal note.",
      createdAt: dateTime("2026-08-09T00:00:00.000Z"),
    } as const;

    const updated = await repository.updateBody({
      annotation: original,
      body: document.body ?? "",
      modifiedAt: dateTime("2026-08-10T00:00:00.000Z"),
    });

    expect(update).toHaveBeenCalledWith({
      path: document.path,
      ifRevision: "rev-1",
      patch: { modified_at: "2026-08-10T00:00:00.000Z" },
      body: document.body,
      includeDocument: true,
    });
    expect(updated.body).toBe(document.body);
    expect(updated.recordRevision).toBe("rev-2");
  });
});

function annotationDocument(): RecordDocument {
  const fields = {
    id: "ann_01",
    source: "[[src_01]]",
    annotation_type: "highlight",
    created_at: "2026-08-09T00:00:00.000Z",
    modified_at: "2026-08-10T00:00:00.000Z",
    tags: [],
  };
  return {
    path: "annotations/ann_01.md",
    revision: "rev-2",
    types: ["reader-annotation"],
    frontmatter: { type: "reader-annotation", ...fields },
    effectiveFrontmatter: fields,
    body: "> Selected text\n\nRevised note.",
    file: {},
  };
}

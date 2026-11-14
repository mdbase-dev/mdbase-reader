import { annotationId, collectionId, dateTime, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectAnnotationRepository } from "./annotation-repository.js";
import { mockSdk, testWrite, testRecord } from "./records.fixtures.js";

import type { RecordView } from "@mdbase-dev/sdk";
import type { Annotation } from "@mdbase-reader/core";

const legacyAuthorityFeatures = {
  supportsAuthorityFeature: vi.fn(() =>
    Promise.resolve({ ok: true as const, value: false, diagnostics: [] }),
  ),
};

function success<Value>(value: Value): Value {
  return value;
}

describe("ConnectAnnotationRepository updates", () => {
  it("updates only the canonical body and modification time revision-safely", async () => {
    const document = annotationDocument();
    const update = vi.fn(() => Promise.resolve(testWrite(success(document))));
    const repository = new ConnectAnnotationRepository(
      mockSdk({
        ...legacyAuthorityFeatures,
        update,
      }),
    );
    const original = annotationFixture();

    const updated = await repository.updateBody({
      annotation: original,
      body: document.body ?? "",
      modifiedAt: dateTime("2026-08-10T00:00:00.000Z"),
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ path: document.path }),
      expect.objectContaining({
        ifRevision: "rev-1",
        patch: { modified_at: "2026-08-10T00:00:00.000Z" },
        body: document.body,
      }),
      expect.anything(),
    );
    expect(updated.body).toBe(document.body);
    expect(updated.recordRevision).toBe("rev-2");
  });
});

describe("ConnectAnnotationRepository deletion", () => {
  it("reuses the confirmed preflight and removes the cached annotation", async () => {
    const original = annotationFixture();
    const record = annotationDocument();
    record.revision = original.recordRevision!;
    const preflight = {
      rewrites: [],
      broken: [
        {
          record: record.id,
          target: record.id,
          raw: "[[annotations/ann_01]]",
          path: "sources/src_01.md",
        },
      ],
    };
    const preflightDelete = vi.fn(() => Promise.resolve(preflight));
    const remove = vi.fn(() => Promise.resolve(testWrite(record)));
    const repository = new ConnectAnnotationRepository(
      mockSdk({ get: vi.fn(() => Promise.resolve(record)), preflightDelete, delete: remove }),
    );
    const plan = await repository.preflightDelete(original);
    expect(plan.brokenLinkPaths).toEqual(["sources/src_01.md"]);
    await repository.delete(original, plan);

    expect(preflightDelete).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith(record, { ifRevision: original.recordRevision });
  });

  it("refuses deletion without the authoritative preflight", async () => {
    const original = annotationFixture();
    const deleteWithProgress = vi.fn();
    const repository = new ConnectAnnotationRepository(
      mockSdk({
        ...legacyAuthorityFeatures,
        deleteWithProgress,
      }),
    );

    await expect(
      repository.delete(original, {
        annotationId: original.id,
        path: original.path ?? "",
        expectedRevision: original.recordRevision ?? ("missing" as never),
        brokenLinkPaths: [],
      }),
    ).rejects.toThrow("current preflight");
    expect(deleteWithProgress).not.toHaveBeenCalled();
  });
});

function annotationFixture(): Annotation {
  return {
    collectionId: collectionId("reading"),
    id: annotationId("ann_01"),
    path: "annotations/ann_01.md",
    recordRevision: "rev-1" as never,
    sourceId: sourceId("src_01"),
    source: "[[src_01]]",
    annotationType: "highlight",
    target: { quote: { exact: "Selected text" } },
    tags: [],
    body: "> Selected text\n\nOriginal note.",
    createdAt: dateTime("2026-08-09T00:00:00.000Z"),
  };
}

function annotationDocument(): RecordView {
  const fields = {
    id: "ann_01",
    source: "[[src_01]]",
    annotation_type: "highlight",
    created_at: "2026-08-09T00:00:00.000Z",
    modified_at: "2026-08-10T00:00:00.000Z",
    tags: [],
  };
  return testRecord({
    path: "annotations/ann_01.md",
    revision: "rev-2",
    types: ["reader-annotation"],
    frontmatter: { type: "reader-annotation", ...fields },
    effective: fields,
    body: "> Selected text\n\nRevised note.",
  });
}

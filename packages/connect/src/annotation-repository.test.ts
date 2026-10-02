import { annotationId, collectionId, dateTime, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectAnnotationRepository } from "./annotation-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, RecordDocument } from "@mdbase-dev/connect";
import type { Annotation } from "@mdbase-reader/core";

const legacyAuthorityFeatures = {
  supportsAuthorityFeature: vi.fn(() =>
    Promise.resolve({ ok: true as const, value: false, diagnostics: [] }),
  ),
};

function success<Value>(value: Value): ConnectOutcome<Value> {
  return { ok: true, value, diagnostics: [] };
}

describe("ConnectAnnotationRepository updates", () => {
  it("updates only the canonical body and modification time revision-safely", async () => {
    const document = annotationDocument();
    const update = vi.fn(() => Promise.resolve(success(document)));
    const repository = new ConnectAnnotationRepository({
      ...legacyAuthorityFeatures,
      update,
    } as unknown as ReaderConnectClient);
    const original = annotationFixture();

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

describe("ConnectAnnotationRepository deletion", () => {
  it("reuses the confirmed preflight and removes the cached annotation", async () => {
    const original = annotationFixture();
    const preflight = {
      path: original.path ?? "",
      deleted: false as const,
      dryRun: true as const,
      wouldDelete: true as const,
      brokenLinks: [{ path: "sources/src_01.md" }, { path: "sources/src_01.md" }],
    };
    const preflightDelete = vi.fn(() => Promise.resolve(success(preflight)));
    const deleteWithProgress = vi.fn(() =>
      Promise.resolve(success({ path: original.path ?? "", deleted: true })),
    );
    const repository = new ConnectAnnotationRepository({
      ...legacyAuthorityFeatures,
      preflightDelete,
      deleteWithProgress,
    } as unknown as ReaderConnectClient);

    const plan = await repository.preflightDelete(original);
    expect(plan.brokenLinkPaths).toEqual(["sources/src_01.md"]);
    await repository.delete(original, plan);

    expect(preflightDelete).toHaveBeenCalledWith({
      path: original.path,
      ifRevision: original.recordRevision,
    });
    expect(deleteWithProgress).toHaveBeenCalledWith(
      {
        path: original.path,
        ifRevision: original.recordRevision,
        checkBacklinks: true,
      },
      { preflight },
    );
  });

  it("refuses deletion without the authoritative preflight", async () => {
    const original = annotationFixture();
    const deleteWithProgress = vi.fn();
    const repository = new ConnectAnnotationRepository({
      ...legacyAuthorityFeatures,
      deleteWithProgress,
    } as unknown as ReaderConnectClient);

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

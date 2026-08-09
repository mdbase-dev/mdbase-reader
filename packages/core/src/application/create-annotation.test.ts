import { describe, expect, it, vi } from "vitest";

import {
  annotationId,
  collectionId,
  fileId,
  mutationId,
  recordRevision,
  sourceId,
  type MutationId,
  type AnnotationId,
} from "../domain/identity.js";
import { fileRevision } from "../domain/revision.js";
import { dateTime } from "../domain/time.js";

import { createAnnotation, type CreateAnnotationDependencies } from "./create-annotation.js";

import type { MutationStage } from "./ports.js";
import type { Annotation } from "../domain/annotation.js";
import type { DomainError } from "../domain/errors.js";
import type { Source } from "../domain/source.js";

const collection = collectionId("collection-1");
const sourceIdentity = sourceId("src_01");
const documentIdentity = fileId("file-1");
const revision = fileRevision("sha256:a8ca22");

function sourceFixture(): Source {
  return {
    collectionId: collection,
    id: sourceIdentity,
    path: "sources/example.md",
    title: "Example",
    creators: [],
    tags: [],
    documents: [
      {
        fileId: documentIdentity,
        file: "[[files/example.pdf]]",
        revision,
        mediaType: "application/pdf",
        role: "primary",
      },
    ],
    body: "A source note.",
    recordRevision: recordRevision("record-r1"),
    frontmatter: {},
  };
}

function dependencies(source: Source | null = sourceFixture()): {
  readonly value: CreateAnnotationDependencies;
  readonly created: Annotation[];
  readonly stages: MutationStage[];
  readonly append: ReturnType<typeof vi.fn>;
  readonly storeAsset: ReturnType<typeof vi.fn>;
} {
  const created: Annotation[] = [];
  const stages: MutationStage[] = [];
  const append = vi.fn(() => Promise.resolve(recordRevision("record-r2")));
  const storeAsset = vi.fn(() => Promise.resolve());
  const value: CreateAnnotationDependencies = {
    assets: { store: storeAsset },
    sources: {
      list: vi.fn(),
      get: vi.fn(() => Promise.resolve(source)),
      updateBody: vi.fn(),
      updateReading: vi.fn(),
      updateCitation: vi.fn(),
      appendAnnotationEmbed: append,
    },
    annotations: {
      listForSource: vi.fn(() => Promise.resolve([])),
      get: vi.fn(() => Promise.resolve(null)),
      updateBody: vi.fn(),
      create: vi.fn((annotation: Annotation) => {
        created.push(annotation);
        return Promise.resolve(annotation);
      }),
    },
    journal: {
      start: vi.fn(() => Promise.resolve()),
      mark: vi.fn((_id: MutationId, stage: MutationStage) => {
        stages.push(stage);
        return Promise.resolve();
      }),
    },
    clock: { now: () => dateTime("2026-08-09T15:18:00+10:00") },
    ids: {
      source: () => sourceId("src_unused"),
      annotation: (): AnnotationId => annotationId("ann_01"),
      mutation: (): MutationId => mutationId("mutation-1"),
    },
  };
  return { value, created, stages, append, storeAsset };
}

const request = {
  collectionId: collection,
  sourceId: sourceIdentity,
  source: "[[sources/example|Example]]",
  document: {
    fileId: documentIdentity,
    file: "[[files/example.pdf]]",
    revision,
  },
  annotationType: "highlight",
  target: {
    quote: { exact: "Selected text", prefix: "Before", suffix: "After" },
    pdf: {
      pageIndex: 0,
      coordinateSpace: {
        profile: "pdf-default-user-space-v1",
        box: "crop" as const,
        origin: "bottom_left" as const,
      },
      quadPoints: [[72, 398, 510, 398, 72, 380, 510, 380]] as const,
    },
  },
  tags: [],
  body: "> Selected text",
} as const;

describe("createAnnotation", () => {
  it("persists an annotation and a deliberate source transclusion", async () => {
    const fixture = dependencies();
    const result = await createAnnotation(fixture.value, {
      ...request,
      transclude: { path: "annotations/ann_01.md" },
    });

    expect(result.annotation.id).toBe("ann_01");
    expect(result.annotation.createdBy).toBe("dev.mdbase.reader");
    expect(result.transcluded).toBe(true);
    expect(fixture.created).toHaveLength(1);
    expect(fixture.append).toHaveBeenCalledWith(
      expect.objectContaining({
        embed: "![[annotations/ann_01]]",
        expectedRevision: "record-r1",
      }),
    );
    expect(fixture.stages).toEqual(["annotation-created", "source-transcluded", "complete"]);
  });

  it("does not modify the source when transclusion is not requested", async () => {
    const fixture = dependencies();
    const result = await createAnnotation(fixture.value, request);

    expect(result.transcluded).toBe(false);
    expect(result.assetStored).toBe(false);
    expect(fixture.append).not.toHaveBeenCalled();
    expect(fixture.stages).toEqual(["annotation-created", "complete"]);
  });

  it("stores a PNG before creating an area annotation with a durable embed", async () => {
    const fixture = dependencies();
    const result = await createAnnotation(fixture.value, {
      ...request,
      annotationType: "area",
      target: {
        pdf: {
          pageIndex: 0,
          coordinateSpace: {
            profile: "embedpdf-capture-page-points-v1",
            box: "crop",
            origin: "top_left",
          },
          quadPoints: [[10, 20, 110, 20, 10, 70, 110, 70]],
        },
      },
      body: "A useful diagram.",
      attachment: { bytes: new Uint8Array([1, 2, 3]), mediaType: "image/png" },
    });

    expect(fixture.storeAsset).toHaveBeenCalledWith({
      collectionId: collection,
      path: "files/annotation-ann_01.png",
      bytes: new Uint8Array([1, 2, 3]),
      mediaType: "image/png",
      idempotencyKey: "mutation-1",
    });
    expect(result.annotation.body).toBe("![[files/annotation-ann_01.png]]\n\nA useful diagram.");
    expect(result.assetStored).toBe(true);
    expect(fixture.stages).toEqual(["asset-stored", "annotation-created", "complete"]);
  });

  it("rejects a stale document revision before writing anything", async () => {
    const fixture = dependencies();

    await expect(
      createAnnotation(fixture.value, {
        ...request,
        document: { ...request.document, revision: fileRevision("sha256:bbbbbb") },
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<DomainError>>({ code: "document-revision-mismatch" }),
    );
    expect(fixture.created).toHaveLength(0);
    expect(fixture.stages).toEqual([]);
  });

  it("leaves a recoverable failed journal entry after a partial mutation", async () => {
    const fixture = dependencies();
    fixture.append.mockRejectedValueOnce(new Error("revision conflict"));

    await expect(
      createAnnotation(fixture.value, {
        ...request,
        transclude: { path: "annotations/ann_01" },
      }),
    ).rejects.toThrow("revision conflict");
    expect(fixture.created).toHaveLength(1);
    expect(fixture.stages).toEqual(["annotation-created", "failed"]);
  });
});

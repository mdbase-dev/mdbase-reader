import { annotationId, collectionId, dateTime, fileId, fileRevision } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { annotationMatchesSurface } from "./annotation-document-compatibility.js";

import type { Annotation } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

const surface = {
  kind: "pdf",
  document: {
    document: {
      file: "[[files/example.pdf]]",
      fileId: fileId("file-1"),
      revision: fileRevision(`sha256:${"a".repeat(64)}`),
    },
  },
} as ReadingSurface;

const annotationDocument = {
  file: "[[files/example.pdf]]",
  fileId: fileId("file-1"),
  revision: fileRevision(`sha256:${"b".repeat(64)}`),
};

const annotation: Annotation = {
  collectionId: collectionId("reading"),
  id: annotationId("ann-1"),
  sourceId: "source-1" as never,
  source: "[[source-1]]",
  document: annotationDocument,
  annotationType: "highlight",
  tags: [],
  body: "",
  createdAt: dateTime("2026-08-14T00:00:00.000Z"),
  target: {
    quote: { exact: "Selected text" },
    pdf: {
      pageIndex: 4,
      coordinateSpace: {
        profile: "embedpdf-selection-page-points-v1",
        box: "crop",
        origin: "top_left",
      },
      quadPoints: [[10, 20, 40, 20, 10, 28, 40, 28]],
    },
  },
};

describe("annotation document compatibility", () => {
  it("accepts PDF coordinates from an earlier byte revision of the same file", () => {
    expect(annotationMatchesSurface(annotation, surface)).toBe(true);
  });

  it("still rejects PDF coordinates belonging to another file", () => {
    expect(
      annotationMatchesSurface(
        {
          ...annotation,
          document: { ...annotationDocument, fileId: fileId("file-2") },
        },
        surface,
      ),
    ).toBe(false);
  });

  it("allows HTML quotations to be relocated after the file changes", () => {
    expect(
      annotationMatchesSurface(
        { ...annotation, target: { quote: { exact: "Selected text" }, html: { css: "p" } } },
        surface,
      ),
    ).toBe(true);
  });

  it("retains exact revision checks for EPUB structural targets", () => {
    expect(
      annotationMatchesSurface(
        {
          ...annotation,
          target: { epub: { cfi: "epubcfi(/6/2)" } },
        },
        surface,
      ),
    ).toBe(false);
  });
});

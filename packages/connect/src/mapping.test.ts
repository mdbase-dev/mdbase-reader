import { collectionId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import {
  annotationFromDocument,
  annotationFrontmatter,
  sourceFromDocument,
  sourceSummaryFromQuery,
} from "./mapping.js";

import type { JsonObject, QueryRecord, RecordDocument } from "@mdbase-dev/connect";

const sourceFrontmatter: JsonObject = {
  id: "src_01",
  title: "Gravity and Grace",
  authors: ["Simone Weil"],
  tags: ["attention"],
  reading: {
    status: "reading",
    document_file_id: "file-01",
    position: { pdf: { page_index: 15 } },
    last_opened_at: "2026-08-09T14:21:00+10:00",
  },
  documents: [
    {
      file_id: "file-01",
      file: "[[files/gravity.pdf]]",
      role: "primary",
      media_type: "application/pdf",
      revision: "sha256:19e81c",
    },
  ],
  csl: {
    id: "weil2002gravity",
    type: "book",
    title: "Gravity and Grace",
    author: [{ family: "Weil", given: "Simone" }],
  },
};

describe("Connect contract mapping", () => {
  it("normalizes source query projections", () => {
    const record = {
      path: "sources/gravity.md",
      effectiveFrontmatter: sourceFrontmatter,
      types: ["reader-source"],
      file: {},
    } satisfies QueryRecord;
    expect(sourceSummaryFromQuery(collectionId("reading"), record)).toMatchObject({
      id: "src_01",
      title: "Gravity and Grace",
      creators: ["Simone Weil"],
      readingStatus: "reading",
      reading: {
        documentFileId: "file-01",
        position: { kind: "pdf", pageIndex: 15 },
      },
      citation: {
        id: "weil2002gravity",
        type: "book",
        author: [{ family: "Weil", given: "Simone" }],
      },
      documents: [{ fileId: "file-01", mediaType: "application/pdf" }],
    });
  });

  it("keeps invalid citation metadata visible without dropping the source", () => {
    const record = {
      path: "sources/gravity.md",
      effectiveFrontmatter: {
        ...sourceFrontmatter,
        csl: { id: "bad key", type: "novel" },
      },
      types: ["reader-source"],
      file: {},
    } satisfies QueryRecord;

    expect(sourceSummaryFromQuery(collectionId("reading"), record)).toMatchObject({
      id: "src_01",
      citationProblems: [
        { path: "csl.id", message: expect.stringContaining("Pandoc-compatible") },
        { path: "csl.type", message: expect.stringContaining("recognized CSL") },
      ],
    });
  });

  it("keeps the persisted source frontmatter and exact revision", () => {
    const record = {
      path: "sources/gravity.md",
      revision: "record-rev-2",
      types: ["reader-source"],
      frontmatter: sourceFrontmatter,
      effectiveFrontmatter: sourceFrontmatter,
      body: "My literature note.",
      file: {},
    } satisfies RecordDocument;
    expect(sourceFromDocument(collectionId("reading"), record)).toMatchObject({
      body: "My literature note.",
      recordRevision: "record-rev-2",
      frontmatter: sourceFrontmatter,
    });
  });

  it("normalizes independently addressable annotations", () => {
    const annotation = annotationFromDocument(collectionId("reading"), {
      path: "annotations/ann_01.md",
      revision: "ann-rev-1",
      frontmatter: {},
      effectiveFrontmatter: {
        id: "ann_01",
        source: "[[src_01|Gravity and Grace]]",
        annotation_type: "highlight",
        created_at: "2026-08-09T14:21:00+10:00",
        document: {
          file_id: "file-01",
          file: "[[files/gravity.pdf]]",
          revision: "sha256:19e81c",
        },
        locator: { label: "p. 16" },
        target: {
          quote: { exact: "Attention consists of suspending thought" },
          pdf: {
            page_index: 15,
            coordinate_space: {
              profile: "embedpdf-page-points-v1",
              box: "crop",
              origin: "top_left",
            },
            quad_points: [[91.2, 201.4, 477.8, 201.4, 91.2, 238.1, 477.8, 238.1]],
          },
        },
      },
      body: "> Attention consists of suspending thought",
    });
    expect(annotation).toMatchObject({
      id: "ann_01",
      sourceId: "src_01",
      annotationType: "highlight",
      document: { fileId: "file-01", revision: "sha256:19e81c" },
      locator: { label: "p. 16" },
      target: {
        quote: { exact: "Attention consists of suspending thought" },
        pdf: { pageIndex: 15, coordinateSpace: { origin: "top_left" } },
      },
    });
    expect(annotationFrontmatter(annotation)).toMatchObject({
      document: { file_id: "file-01", revision: "sha256:19e81c" },
      locator: { label: "p. 16" },
      target: {
        pdf: {
          page_index: 15,
          coordinate_space: { profile: "embedpdf-page-points-v1", origin: "top_left" },
        },
      },
    });
  });
});

describe("Connect EPUB annotation mapping", () => {
  it("round-trips an EPUB CFI", () => {
    const annotation = annotationFromDocument(collectionId("reading"), {
      path: "annotations/ann_epub.md",
      revision: "ann-rev-2",
      frontmatter: {},
      effectiveFrontmatter: {
        id: "ann_epub",
        source: "[[src_01]]",
        annotation_type: "highlight",
        created_at: "2026-08-09T14:21:00+10:00",
        target: {
          quote: { exact: "Selected EPUB text" },
          epub: {
            cfi: "epubcfi(/6/4!/4/2,/1:0,/1:12)",
          },
        },
      },
      body: "> Selected EPUB text",
    });

    expect(annotation.target?.epub).toEqual({
      cfi: "epubcfi(/6/4!/4/2,/1:0,/1:12)",
    });
    expect(annotationFrontmatter(annotation)).toMatchObject({
      target: {
        epub: {
          cfi: "epubcfi(/6/4!/4/2,/1:0,/1:12)",
        },
      },
    });
  });
});

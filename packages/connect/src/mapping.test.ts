import { collectionId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { annotationFromDocument, sourceFromDocument, sourceSummaryFromQuery } from "./mapping.js";

import type { JsonObject, QueryRecord, RecordDocument } from "@mdbase-dev/connect";

const sourceFrontmatter: JsonObject = {
  id: "src_01",
  title: "Gravity and Grace",
  authors: ["Simone Weil"],
  tags: ["attention"],
  reading: { status: "reading" },
  documents: [
    {
      file_id: "file-01",
      file: "[[files/gravity.pdf]]",
      role: "primary",
      media_type: "application/pdf",
      revision: "sha256:19e81c",
    },
  ],
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
      documents: [{ fileId: "file-01", mediaType: "application/pdf" }],
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
    expect(
      annotationFromDocument(collectionId("reading"), {
        path: "annotations/ann_01.md",
        frontmatter: {},
        effectiveFrontmatter: {
          id: "ann_01",
          source: "[[src_01|Gravity and Grace]]",
          annotation_type: "highlight",
          created_at: "2026-08-09T14:21:00+10:00",
          target: { quote: { exact: "Attention consists of suspending thought" } },
        },
        body: "> Attention consists of suspending thought",
      }),
    ).toMatchObject({
      id: "ann_01",
      sourceId: "src_01",
      annotationType: "highlight",
      target: { quote: { exact: "Attention consists of suspending thought" } },
    });
  });
});

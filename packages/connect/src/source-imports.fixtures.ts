import { collectionId, dateTime, mutationId, sourceId } from "@mdbase-reader/core";

import { testRecord } from "./records.fixtures.js";

import type { FileView, RecordView, QueryResult } from "@mdbase-dev/sdk";
import type { PlannedSourceFileImport } from "@mdbase-reader/core";

export const digest = `sha256:${"a".repeat(64)}` as const;

export function plan(): PlannedSourceFileImport {
  return {
    collectionId: collectionId("reading"),
    sourceId: sourceId("src_import"),
    title: "Manuscript",
    kind: "document",
    savedAt: dateTime("2026-08-10T12:00:00.000Z"),
    recordPath: "sources/src_import.md",
    recordPathCandidates: ["sources/src_import.md"],
    representations: [
      {
        transferId: mutationId("83dd2f80-c7da-44d7-9844-6ea755a05f40"),
        role: "primary",
        format: "pdf",
        mediaType: "application/pdf",
        contentDigest: digest,
        originalName: "manuscript.pdf",
        filePath: "files/reader/src_import/manuscript.pdf",
        bytes: new Uint8Array([1, 2, 3]),
      },
    ],
  };
}

export function fileDescriptor(overrides: Partial<FileView> = {}): FileView {
  return {
    id: "file-import",
    state: "materialized",
    confirmedSeq: 1,
    path: "files/reader/src_import/manuscript.pdf",
    digest,
    size: 3,
    mediaType: "application/pdf",
    media: "pdf",
    mtime: Date.parse("2026-08-10T12:00:00.000Z"),
    ...overrides,
  };
}

export function queryRecord(id: string, revision: string): QueryResult["records"][number] {
  return testRecord({
    path: `sources/${id}.md`,
    types: ["reader-source"],
    frontmatter: {},
    effective: {
      id,
      title: id,
      documents: [
        {
          file_id: `file-${id}`,
          file: `[[files/${id}.pdf]]`,
          role: "primary",
          media_type: "application/pdf",
          revision,
        },
      ],
    },
  });
}

export function recordDocument(): RecordView {
  const frontmatter = {
    type: "reader-source",
    id: "src_import",
    title: "Manuscript",
    kind: "document",
    saved_at: "2026-08-10T12:00:00.000Z",
    documents: [
      {
        file_id: "file-import",
        file: "[[files/reader/src_import/manuscript.pdf]]",
        role: "primary",
        format: "pdf",
        media_type: "application/pdf",
        revision: digest,
      },
    ],
    reading: { status: "inbox" },
  };
  return testRecord({
    path: "sources/src_import.md",
    revision: "record-r1",
    types: ["reader-source"],
    frontmatter,
    effective: frontmatter,
    body: "# Manuscript\n",
  });
}

export function success<Value>(value: Value): Value {
  return value;
}

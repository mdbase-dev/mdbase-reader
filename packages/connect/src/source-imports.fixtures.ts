import { collectionId, dateTime, mutationId, sourceId } from "@mdbase-reader/core";

import type {
  CollectionFileDescriptor,
  ConnectOutcome,
  QueryResult,
  RecordDocument,
} from "@mdbase-dev/connect";
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

export function fileDescriptor(
  overrides: Partial<CollectionFileDescriptor> = {},
): CollectionFileDescriptor {
  return {
    fileId: "file-import",
    path: "files/reader/src_import/manuscript.pdf",
    revision: "file-r1",
    contentDigest: digest,
    size: 3,
    mediaType: "application/pdf",
    mediaClass: "pdf",
    modifiedAt: "2026-08-10T12:00:00.000Z",
    ...overrides,
  };
}

export function queryRecord(id: string, revision: string): QueryResult["results"][number] {
  return {
    path: `sources/${id}.md`,
    types: ["reader-source"],
    frontmatter: {},
    effectiveFrontmatter: {
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
    file: {},
  };
}

export function recordDocument(): RecordDocument {
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
  return {
    path: "sources/src_import.md",
    revision: "record-r1",
    types: ["reader-source"],
    frontmatter,
    effectiveFrontmatter: frontmatter,
    body: "# Manuscript\n",
    file: {},
  };
}

export function success<Value>(value: Value): ConnectOutcome<Value> {
  return { ok: true, value, diagnostics: [] };
}

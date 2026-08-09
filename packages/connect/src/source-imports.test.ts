import { collectionId, dateTime, mutationId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectSourceImportRepository } from "./source-imports.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { CollectionFileDescriptor, ConnectOutcome, RecordDocument } from "@mdbase-dev/connect";
import type { PlannedSourceFileImport } from "@mdbase-reader/core";

const digest = `sha256:${"a".repeat(64)}` as const;

describe("ConnectSourceImportRepository", () => {
  it("uploads exact bytes before creating a whole source record", async () => {
    const upload = vi.fn((_path: string, _source: Blob) => Promise.resolve(fileDescriptor()));
    const create = vi.fn(() => Promise.resolve(success(recordDocument())));
    const repository = new ConnectSourceImportRepository(
      { create } as unknown as ReaderConnectClient,
      { upload },
    );

    const source = await repository.commitFile(plan());

    expect(upload).toHaveBeenCalledWith(
      "files/reader/src_import/manuscript.pdf",
      expect.any(Blob),
      {
        mediaType: "application/pdf",
        transferId: "83dd2f80-c7da-44d7-9844-6ea755a05f40",
      },
    );
    const uploadedBlob = upload.mock.calls[0]?.[1];
    expect(uploadedBlob).toBeInstanceOf(Blob);
    if (!uploadedBlob) {
      throw new Error("The import did not upload a Blob.");
    }
    expect(new Uint8Array(await uploadedBlob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(create).toHaveBeenCalledWith({
      path: "sources/src_import.md",
      type: "reader-source",
      frontmatter: {
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
            label: "manuscript.pdf",
          },
        ],
        reading: { status: "inbox" },
      },
      body: "# Manuscript\n",
      includeDocument: true,
    });
    expect(source.documents[0]).toMatchObject({
      fileId: "file-import",
      revision: digest,
      mediaType: "application/pdf",
    });
  });

  it("recovers an ambiguous record create without issuing another mutation", async () => {
    const failure = {
      ok: false,
      problem: { code: "timeout", message: "Outcome unknown" },
      diagnostics: [],
    } as const;
    const create = vi.fn(() => Promise.resolve(failure));
    const read = vi.fn(() => Promise.resolve(success(recordDocument())));
    const repository = new ConnectSourceImportRepository(
      { create, read } as unknown as ReaderConnectClient,
      { upload: vi.fn(() => Promise.resolve(fileDescriptor())) },
    );

    const source = await repository.commitFile(plan());

    expect(source.id).toBe("src_import");
    expect(create).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith({
      path: "sources/src_import.md",
      contract: { id: "dev.mdbase.reader.source", version: "1.0.0-beta.1" },
      includeDocument: true,
    });
  });

  it("refuses a descriptor whose digest differs from the planned bytes", async () => {
    const repository = new ConnectSourceImportRepository(
      { create: vi.fn() } as unknown as ReaderConnectClient,
      {
        upload: vi.fn(() =>
          Promise.resolve({
            ...fileDescriptor(),
            contentDigest: `sha256:${"b".repeat(64)}` as const,
          }),
        ),
      },
    );

    await expect(repository.commitFile(plan())).rejects.toThrow(
      "stored file did not match the selected bytes",
    );
  });
});

function plan(): PlannedSourceFileImport {
  return {
    collectionId: collectionId("reading"),
    sourceId: sourceId("src_import"),
    mutationId: mutationId("83dd2f80-c7da-44d7-9844-6ea755a05f40"),
    title: "Manuscript",
    kind: "document",
    format: "pdf",
    mediaType: "application/pdf",
    savedAt: dateTime("2026-08-10T12:00:00.000Z"),
    contentDigest: digest,
    originalName: "manuscript.pdf",
    recordPath: "sources/src_import.md",
    filePath: "files/reader/src_import/manuscript.pdf",
    bytes: new Uint8Array([1, 2, 3]),
  };
}

function fileDescriptor(): CollectionFileDescriptor {
  return {
    fileId: "file-import",
    path: "files/reader/src_import/manuscript.pdf",
    revision: "file-r1",
    contentDigest: digest,
    size: 3,
    mediaType: "application/pdf",
    mediaClass: "pdf",
    modifiedAt: "2026-08-10T12:00:00.000Z",
  };
}

function recordDocument(): RecordDocument {
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

function success<Value>(value: Value): ConnectOutcome<Value> {
  return { ok: true, value, diagnostics: [] };
}

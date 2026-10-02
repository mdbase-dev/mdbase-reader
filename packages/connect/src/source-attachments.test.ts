import { collectionId, dateTime, mutationId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import {
  digest,
  fileDescriptor,
  plan,
  recordDocument,
  success,
} from "./source-imports.fixtures.js";
import { ConnectSourceImportRepository } from "./source-imports.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { PlannedSourceAttachment } from "@mdbase-reader/core";

const legacyAuthorityFeatures = {
  supportsAuthorityFeature: vi.fn(() =>
    Promise.resolve({ ok: true as const, value: false, diagnostics: [] }),
  ),
};

describe("sources without documents", () => {
  it("creates the record with its kind and web address and no documents", async () => {
    const upload = vi.fn();
    const create = vi.fn(() => Promise.resolve(success(recordDocument())));
    const repository = new ConnectSourceImportRepository(
      {
        ...legacyAuthorityFeatures,
        create,
      } as unknown as ReaderConnectClient,
      { upload },
    );

    await repository.commitFile({
      ...plan(),
      kind: "book",
      representations: [],
      url: "https://doi.org/10.4324/9780203168455",
    });

    expect(upload).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      path: "sources/src_import.md",
      type: "reader-source",
      frontmatter: {
        id: "src_import",
        title: "Manuscript",
        kind: "book",
        saved_at: "2026-08-10T12:00:00.000Z",
        url: "https://doi.org/10.4324/9780203168455",
        reading: { status: "inbox" },
      },
      body: "# Manuscript\n",
      includeDocument: true,
    });
  });
});

describe("attaching a file to an existing source", () => {
  it("uploads, then appends the document at the revision it read", async () => {
    const upload = vi.fn(() =>
      Promise.resolve(
        fileDescriptor({ fileId: "file-new", path: "files/reader/src_import/dostoevsky.pdf" }),
      ),
    );
    const existing = recordDocument();
    const read = vi.fn(() => Promise.resolve(success(existing)));
    const update = vi.fn(() => Promise.resolve(success(existing)));
    const repository = new ConnectSourceImportRepository(
      {
        ...legacyAuthorityFeatures,
        read,
        update,
      } as unknown as ReaderConnectClient,
      { upload },
    );

    await repository.attachFile(attachment());

    expect(upload).toHaveBeenCalledWith(
      "files/reader/src_import/dostoevsky.pdf",
      expect.any(Blob),
      {
        mediaType: "application/pdf",
        transferId: "83dd2f80-c7da-44d7-9844-6ea755a05f40",
      },
    );
    expect(update).toHaveBeenCalledWith({
      path: "sources/src_import.md",
      ifRevision: "record-r1",
      patch: {
        documents: [
          ...(existing.frontmatter["documents"] as unknown[]),
          {
            file_id: "file-new",
            file: "[[files/reader/src_import/dostoevsky.pdf]]",
            role: "alternative",
            format: "pdf",
            media_type: "application/pdf",
            revision: digest,
            label: "dostoevsky.pdf",
            origin_url: "https://example.org/dostoevsky.pdf",
            retrieved_at: "2026-09-25T00:00:00.000Z",
          },
        ],
      },
      includeDocument: true,
    });
  });

  it("refuses when the stored bytes differ or the record path now holds another source", async () => {
    const mismatched = new ConnectSourceImportRepository(
      {
        ...legacyAuthorityFeatures,
        read: vi.fn(),
        update: vi.fn(),
      } as unknown as ReaderConnectClient,
      { upload: vi.fn(() => Promise.resolve(fileDescriptor({ contentDigest: "sha256:other" }))) },
    );
    await expect(mismatched.attachFile(attachment())).rejects.toThrow("did not match");

    const moved = { ...recordDocument(), frontmatter: { id: "src_other" } };
    const update = vi.fn();
    const elsewhere = new ConnectSourceImportRepository(
      {
        ...legacyAuthorityFeatures,
        read: vi.fn(() => Promise.resolve(success(moved))),
        update,
      } as unknown as ReaderConnectClient,
      { upload: vi.fn(() => Promise.resolve(fileDescriptor())) },
    );
    await expect(elsewhere.attachFile(attachment())).rejects.toThrow("changed location");
    expect(update).not.toHaveBeenCalled();
  });
});

function attachment(): PlannedSourceAttachment {
  return {
    collectionId: collectionId("reading"),
    sourceId: sourceId("src_import"),
    recordPath: "sources/src_import.md",
    originUrl: "https://example.org/dostoevsky.pdf",
    retrievedAt: dateTime("2026-09-25T00:00:00.000Z"),
    representation: {
      transferId: mutationId("83dd2f80-c7da-44d7-9844-6ea755a05f40"),
      role: "alternative",
      format: "pdf",
      mediaType: "application/pdf",
      contentDigest: digest,
      originalName: "dostoevsky.pdf",
      filePath: "files/reader/src_import/dostoevsky.pdf",
      bytes: new Uint8Array([1, 2, 3]),
    },
  };
}

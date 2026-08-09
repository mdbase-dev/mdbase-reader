import { collectionId, fileId, fileRevision } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectDocumentRepository } from "./documents.js";

import type { ConnectDocumentError, ReaderFileClient } from "./documents.js";
import type { CollectionFileDescriptor } from "@mdbase-dev/connect";

const descriptor: CollectionFileDescriptor = {
  fileId: "file-01",
  path: "files/example.pdf",
  revision: "file-revision-2",
  contentDigest: `sha256:${"a".repeat(64)}`,
  size: 3,
  mediaType: "application/pdf",
  mediaClass: "pdf",
  modifiedAt: "2026-08-09T12:00:00Z",
};

function files(items: readonly CollectionFileDescriptor[]): ReaderFileClient {
  return {
    async *list(): AsyncIterable<CollectionFileDescriptor> {
      await Promise.resolve();
      yield* items;
    },
    download: vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" })),
  };
}

describe("ConnectDocumentRepository", () => {
  it("downloads the exact requested revision and revokes its object URL once", async () => {
    const client = files([descriptor]);
    const urls = { create: vi.fn(() => "blob:reader-file"), revoke: vi.fn() };
    const repository = new ConnectDocumentRepository(client, urls);
    const handle = await repository.open(
      collectionId("reading"),
      fileId("file-01"),
      fileRevision(descriptor.contentDigest),
    );

    expect(handle).toMatchObject({
      fileId: "file-01",
      revision: descriptor.contentDigest,
      mediaType: "application/pdf",
      url: "blob:reader-file",
    });
    expect(client.download).toHaveBeenCalledWith(descriptor);
    await handle.close();
    await handle.close();
    expect(urls.revoke).toHaveBeenCalledTimes(1);
  });

  it("refuses to render bytes after the source descriptor revision changes", async () => {
    const repository = new ConnectDocumentRepository(files([descriptor]));
    await expect(
      repository.open(
        collectionId("reading"),
        fileId("file-01"),
        fileRevision(`sha256:${"b".repeat(64)}`),
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ConnectDocumentError>>({
        message: "mdbase Connect could not open document: file_revision_changed",
      }),
    );
  });
});

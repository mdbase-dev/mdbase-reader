import { collectionId, fileId, fileRevision, type DocumentTarget } from "@mdbase-reader/core";
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

const target: DocumentTarget = {
  fileId: fileId("file-01"),
  file: "[[files/example.pdf]]",
  revision: fileRevision(descriptor.contentDigest),
};

describe("ConnectDocumentRepository", () => {
  it("downloads the exact requested revision and retains its object URL for reuse", async () => {
    const client = files([descriptor]);
    const urls = { create: vi.fn(() => "blob:reader-file"), revoke: vi.fn() };
    const repository = new ConnectDocumentRepository(client, urls);
    const handle = await repository.open(collectionId("reading"), target);

    expect(handle).toMatchObject({
      fileId: "file-01",
      revision: descriptor.contentDigest,
      mediaType: "application/pdf",
      url: "blob:reader-file",
    });
    expect(client.download).toHaveBeenCalledWith(descriptor);
    await handle.close();
    await handle.close();
    expect(urls.revoke).not.toHaveBeenCalled();

    const reopened = await repository.open(collectionId("reading"), target);
    expect(reopened.url).toBe("blob:reader-file");
    expect(client.download).toHaveBeenCalledOnce();
    await reopened.close();
    repository.dispose();
    expect(urls.revoke).toHaveBeenCalledTimes(1);
  });

  it("opens the current bytes and reports their revision when source metadata is stale", async () => {
    const changed = { ...descriptor, contentDigest: `sha256:${"b".repeat(64)}` as const };
    const client = files([changed]);
    const repository = new ConnectDocumentRepository(client);
    const handle = await repository.open(collectionId("reading"), target);
    expect(handle.revision).toBe(changed.contentDigest);
    expect(client.download).toHaveBeenCalledWith(changed);
    await handle.close();
  });

  it("does not reuse stale file metadata after the same file ID changes", async () => {
    let current = descriptor;
    const client: ReaderFileClient = {
      async *list() {
        await Promise.resolve();
        yield current;
      },
      download: vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" })),
    };
    const repository = new ConnectDocumentRepository(client);
    const first = await repository.open(collectionId("reading"), target);
    await first.close();
    current = { ...descriptor, contentDigest: `sha256:${"b".repeat(64)}` };
    const next = await repository.open(collectionId("reading"), target);
    expect(next.revision).toBe(current.contentDigest);
    expect(client.download).toHaveBeenCalledTimes(2);
    await next.close();
  });

  it("scopes file discovery to the selected folder and refreshes descriptors on each open", async () => {
    const list = vi.fn(async function* (options?: {
      readonly folder?: string;
    }): AsyncIterable<CollectionFileDescriptor> {
      await Promise.resolve();
      expect(options).toEqual({ folder: "files/example", pageSize: 100 });
      yield { ...descriptor, path: "files/example/article.pdf" };
    });
    const client = {
      list,
      download: vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" })),
    } satisfies ReaderFileClient;
    const repository = new ConnectDocumentRepository(client, {
      create: vi.fn(() => "blob:reader-file"),
      revoke: vi.fn(),
    });
    const nestedTarget = { ...target, file: "[[files/example/article.pdf]]" };

    const first = await repository.open(collectionId("reading"), nestedTarget);
    await first.close();
    const second = await repository.open(collectionId("reading"), nestedTarget);
    await second.close();

    expect(list).toHaveBeenCalledTimes(2);
  });

  it("stops listing the folder once the file ID is found", async () => {
    const pulled: string[] = [];
    const client: ReaderFileClient = {
      async *list() {
        for (const item of [
          { ...descriptor, fileId: "file-00", path: "files/other.pdf" },
          descriptor,
          { ...descriptor, fileId: "file-02", path: "files/later.pdf" },
        ]) {
          await Promise.resolve();
          pulled.push(item.fileId);
          yield item;
        }
      },
      download: vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" })),
    };
    const handle = await new ConnectDocumentRepository(client).open(
      collectionId("reading"),
      target,
    );

    expect(pulled).toEqual(["file-00", "file-01"]);
    await handle.close();
  });
});

describe("ConnectDocumentRepository recovery and caching", () => {
  it("recovers a migrated file reference only when its path and digest are exact", async () => {
    const migrated = {
      ...descriptor,
      fileId: "file-02",
      path: "files/example.pdf",
    } satisfies CollectionFileDescriptor;
    const client = files([migrated]);
    const repository = new ConnectDocumentRepository(client, {
      create: vi.fn(() => "blob:reader-file"),
      revoke: vi.fn(),
    });

    const handle = await repository.open(collectionId("reading"), target);

    expect(handle.fileId).toBe("file-02");
    expect(client.download).toHaveBeenCalledWith(migrated);
    await handle.close();
  });

  it("rejects a path match when the referenced digest is stale", async () => {
    const migrated = {
      ...descriptor,
      fileId: "file-02",
      path: "files/example.pdf",
      contentDigest: `sha256:${"b".repeat(64)}` as const,
    } satisfies CollectionFileDescriptor;
    const repository = new ConnectDocumentRepository(files([migrated]));

    await expect(repository.open(collectionId("reading"), target)).rejects.toEqual(
      expect.objectContaining<Partial<ConnectDocumentError>>({
        message: "mdbase Connect could not open document: file_not_found",
      }),
    );
  });

  it("forwards cancellation through descriptor lookup and download", async () => {
    const controller = new AbortController();
    const list = vi.fn(async function* (options?: {
      readonly signal?: AbortSignal;
    }): AsyncIterable<CollectionFileDescriptor> {
      await Promise.resolve();
      expect(options?.signal).toBe(controller.signal);
      yield descriptor;
    });
    const download = vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    const repository = new ConnectDocumentRepository(
      { list, download },
      {
        create: vi.fn(() => "blob:reader-file"),
        revoke: vi.fn(),
      },
    );

    const handle = await repository.open(collectionId("reading"), target, {
      signal: controller.signal,
    });

    expect(download).toHaveBeenCalledWith(descriptor, { signal: controller.signal });
    await handle.close();
  });

  it("evicts the least recently used closed document but never an open handle", async () => {
    const secondDescriptor = {
      ...descriptor,
      fileId: "file-02",
      path: "files/second.pdf",
      contentDigest: `sha256:${"b".repeat(64)}` as const,
    } satisfies CollectionFileDescriptor;
    const client = files([descriptor, secondDescriptor]);
    let urlSequence = 0;
    const urls = {
      create: vi.fn(() => `blob:reader-${String(++urlSequence)}`),
      revoke: vi.fn(),
    };
    const repository = new ConnectDocumentRepository(client, urls, 1);
    const first = await repository.open(collectionId("reading"), target);
    const second = await repository.open(collectionId("reading"), {
      fileId: fileId(secondDescriptor.fileId),
      file: secondDescriptor.path,
      revision: fileRevision(secondDescriptor.contentDigest),
    });

    expect(urls.revoke).not.toHaveBeenCalled();
    await second.close();
    expect(urls.revoke).toHaveBeenCalledTimes(1);
    expect(urls.revoke).toHaveBeenCalledWith(second.url);
    await first.close();
    repository.dispose();
  });
});

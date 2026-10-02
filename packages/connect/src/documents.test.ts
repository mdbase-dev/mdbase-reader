import { connectFailure, connectProblem } from "@mdbase-dev/connect/advanced";
import { collectionId, fileId, fileRevision, type DocumentTarget } from "@mdbase-reader/core";
import { describe, expect, it, vi, type Mock } from "vitest";

import { ConnectDocumentRepository } from "./documents.js";

import type { ReaderFileClient } from "./documents.js";
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
const target: DocumentTarget = {
  fileId: fileId("file-01"),
  file: "[[files/example.pdf]]",
  revision: fileRevision(descriptor.contentDigest),
};
const collection = collectionId("reading");
function files(items: readonly CollectionFileDescriptor[]): {
  stat: Mock<ReaderFileClient["stat"]>;
  download: Mock<ReaderFileClient["download"]>;
} {
  return {
    stat: vi.fn<ReaderFileClient["stat"]>((target) =>
      Promise.resolve({
        ok: true,
        diagnostics: [],
        value:
          items.find((item) =>
            "fileId" in target ? item.fileId === target.fileId : item.path === target.path,
          ) ?? null,
      }),
    ),
    download: vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" })),
  };
}
function urls(): { create: Mock<() => string>; revoke: Mock<(url: string) => void> } {
  let sequence = 0;
  return { create: vi.fn(() => `blob:reader-${String(++sequence)}`), revoke: vi.fn() };
}

describe("ConnectDocumentRepository", () => {
  it("refreshes metadata on each open while reusing leased object URLs for unchanged bytes", async () => {
    const client = files([descriptor]);
    const objectUrls = urls();
    const repository = new ConnectDocumentRepository(client, objectUrls);
    const first = await repository.open(collection, target);
    expect(first).toMatchObject({
      fileId: "file-01",
      revision: descriptor.contentDigest,
      mediaType: "application/pdf",
    });
    await first.close();
    await first.close();
    const next = await repository.open(collection, target);
    expect(next.url).toBe(first.url);
    expect(client.stat).toHaveBeenCalledTimes(2);
    expect(client.stat).toHaveBeenCalledWith({ fileId: target.fileId }, {});
    expect(client.download).toHaveBeenCalledExactlyOnceWith(descriptor);
    expect(objectUrls.revoke).not.toHaveBeenCalled();
    await next.close();
    repository.dispose();
    expect(objectUrls.revoke).toHaveBeenCalledExactlyOnceWith(first.url);
  });

  it("opens current bytes after the same ID moves or changes, even with stale source metadata", async () => {
    const client = files([descriptor]);
    const repository = new ConnectDocumentRepository(client, urls());
    const first = await repository.open(collection, target);
    await first.close();
    const changed = {
      ...descriptor,
      path: "elsewhere/moved.pdf",
      contentDigest: `sha256:${"b".repeat(64)}` as const,
    };
    client.stat.mockImplementation(files([changed]).stat);
    const next = await repository.open(collection, target);
    expect(next.revision).toBe(changed.contentDigest);
    expect(client.download).toHaveBeenLastCalledWith(changed);
    expect(client.download).toHaveBeenCalledTimes(2);
    await next.close();
  });

  it("recovers a migrated ID by exact path and digest only", async () => {
    const migrated = { ...descriptor, fileId: "file-02" };
    const client = files([migrated]);
    const handle = await new ConnectDocumentRepository(client, urls()).open(collection, target);
    expect(handle.fileId).toBe("file-02");
    expect(client.stat.mock.calls.map(([target]) => target)).toEqual([
      { fileId: "file-01" },
      { path: descriptor.path },
    ]);
    expect(client.download).toHaveBeenCalledWith(migrated);
    await handle.close();
  });

  it("rejects a migrated path when the referenced digest is stale", async () => {
    const client = files([
      { ...descriptor, fileId: "file-02", contentDigest: `sha256:${"b".repeat(64)}` },
    ]);
    await expect(new ConnectDocumentRepository(client).open(collection, target)).rejects.toThrow(
      "file_not_found",
    );
    expect(client.download).not.toHaveBeenCalled();
  });

  it("reports a missing descriptor", async () => {
    await expect(new ConnectDocumentRepository(files([])).open(collection, target)).rejects.toThrow(
      "file_not_found",
    );
  });

  it("does not downgrade stat failures to path lookup or download", async () => {
    const client = files([descriptor]);
    client.stat.mockResolvedValue(connectFailure(connectProblem("access_denied", "Denied")));
    await expect(new ConnectDocumentRepository(client).open(collection, target)).rejects.toThrow(
      "Denied",
    );
    expect(client.stat).toHaveBeenCalledOnce();
    expect(client.download).not.toHaveBeenCalled();
  });

  it("forwards cancellation through stat and download", async () => {
    const signal = new AbortController().signal;
    const client = files([descriptor]);
    const handle = await new ConnectDocumentRepository(client, urls()).open(collection, target, {
      signal,
    });
    expect(client.stat).toHaveBeenCalledWith({ fileId: target.fileId }, { signal });
    expect(client.download).toHaveBeenCalledWith(descriptor, { signal });
    await handle.close();
  });

  it("evicts closed URLs but never an open handle", async () => {
    const second = {
      ...descriptor,
      fileId: "file-02",
      path: "files/second.pdf",
      contentDigest: `sha256:${"b".repeat(64)}` as const,
    };
    const objectUrls = urls();
    const repository = new ConnectDocumentRepository(files([descriptor, second]), objectUrls, 1);
    const first = await repository.open(collection, target);
    const next = await repository.open(collection, {
      fileId: fileId(second.fileId),
      file: second.path,
      revision: fileRevision(second.contentDigest),
    });
    expect(objectUrls.revoke).not.toHaveBeenCalled();
    await next.close();
    expect(objectUrls.revoke).toHaveBeenCalledExactlyOnceWith(next.url);
    await first.close();
    repository.dispose();
  });
});

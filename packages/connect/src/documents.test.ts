import { mdbaseError } from "@mdbase-dev/sdk";
import { collectionId, fileId, fileRevision, type DocumentTarget } from "@mdbase-reader/core";
import { describe, expect, it, vi, type Mock } from "vitest";

import { ConnectDocumentRepository } from "./documents.js";

import type { ReaderFileClient } from "./documents.js";
import type { FileView } from "@mdbase-dev/sdk";

const descriptor: FileView = {
  id: "file-01",
  state: "materialized",
  confirmedSeq: 1,
  path: "files/example.pdf",
  digest: `sha256:${"a".repeat(64)}`,
  size: 3,
  mediaType: "application/pdf",
  media: "pdf",
  mtime: Date.parse("2026-08-09T12:00:00Z"),
};
const target: DocumentTarget = {
  fileId: fileId("file-01"),
  file: "[[files/example.pdf]]",
  revision: fileRevision(descriptor.digest),
};
const collection = collectionId("reading");
function files(items: readonly FileView[]): {
  get: Mock<ReaderFileClient["get"]>;
  download: Mock<ReaderFileClient["download"]>;
} {
  return {
    get: vi.fn<ReaderFileClient["get"]>((target) => {
      const found = items.find((item) =>
        typeof target === "string" ? item.id === target : item.path === target.path,
      );
      return found ? Promise.resolve(found) : Promise.reject(mdbaseError("not_found", "Missing"));
    }),
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
      revision: descriptor.digest,
      mediaType: "application/pdf",
    });
    await first.close();
    await first.close();
    const next = await repository.open(collection, target);
    expect(next.url).toBe(first.url);
    expect(client.get).toHaveBeenCalledTimes(2);
    expect(client.get).toHaveBeenCalledWith(target.fileId, {});
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
      digest: `sha256:${"b".repeat(64)}` as const,
    };
    client.get.mockImplementation(files([changed]).get);
    const next = await repository.open(collection, target);
    expect(next.revision).toBe(changed.digest);
    expect(client.download).toHaveBeenLastCalledWith(changed);
    expect(client.download).toHaveBeenCalledTimes(2);
    await next.close();
  });

  it("recovers a migrated ID by exact path and digest only", async () => {
    const migrated = { ...descriptor, id: "file-02" };
    const client = files([migrated]);
    const handle = await new ConnectDocumentRepository(client, urls()).open(collection, target);
    expect(handle.fileId).toBe("file-02");
    expect(client.get.mock.calls.map(([target]) => target)).toEqual([
      "file-01",
      { path: descriptor.path },
    ]);
    expect(client.download).toHaveBeenCalledWith(migrated);
    await handle.close();
  });

  it("rejects a migrated path when the referenced digest is stale", async () => {
    const client = files([{ ...descriptor, id: "file-02", digest: `sha256:${"b".repeat(64)}` }]);
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

  it("does not downgrade get failures to path lookup or download", async () => {
    const client = files([descriptor]);
    client.get.mockRejectedValue(mdbaseError("forbidden", "Denied"));
    await expect(new ConnectDocumentRepository(client).open(collection, target)).rejects.toThrow(
      "Denied",
    );
    expect(client.get).toHaveBeenCalledOnce();
    expect(client.download).not.toHaveBeenCalled();
  });

  it("forwards cancellation through get and download", async () => {
    const signal = new AbortController().signal;
    const client = files([descriptor]);
    const handle = await new ConnectDocumentRepository(client, urls()).open(collection, target, {
      signal,
    });
    expect(client.get).toHaveBeenCalledWith(target.fileId, { signal });
    expect(client.download).toHaveBeenCalledWith(descriptor, { signal });
    await handle.close();
  });

  it("evicts closed URLs but never an open handle", async () => {
    const second = {
      ...descriptor,
      id: "file-02",
      path: "files/second.pdf",
      digest: `sha256:${"b".repeat(64)}` as const,
    };
    const objectUrls = urls();
    const repository = new ConnectDocumentRepository(files([descriptor, second]), objectUrls, 1);
    const first = await repository.open(collection, target);
    const next = await repository.open(collection, {
      fileId: fileId(second.id),
      file: second.path,
      revision: fileRevision(second.digest),
    });
    expect(objectUrls.revoke).not.toHaveBeenCalled();
    await next.close();
    expect(objectUrls.revoke).toHaveBeenCalledExactlyOnceWith(next.url);
    await first.close();
    repository.dispose();
  });
});

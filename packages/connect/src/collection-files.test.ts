import { collectionId, fileRevision } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectCollectionFileRepository } from "./collection-files.js";

import type { CollectionFileDescriptor } from "@mdbase-dev/connect";
import type { Mock } from "vitest";

describe("bounded collection file reads", () => {
  it("keeps screenshot grids within two active reads", async () => {
    let active = 0;
    let maximum = 0;
    const download = vi.fn(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      active--;
      return new Blob(["PNG"]);
    });
    const { repository, list } = readFixture(download);
    const files = await Promise.all(
      Array.from({ length: 11 }, (_, index) =>
        repository.read(collectionId("reading"), `files/${String(index)}.png`),
      ),
    );
    expect(files).toHaveLength(11);
    expect(maximum).toBe(2);
    expect(list.mock.calls.length).toBeLessThanOrEqual(2);
    expect(download).toHaveBeenCalledTimes(11);
  });

  it("cancels queued reads promptly without starting their I/O", async () => {
    let release: (blob: Blob) => void = () => {
      throw new Error("Uninitialized gate");
    };
    const gate = new Promise<Blob>((resolve) => {
      release = resolve;
    });
    const download = vi.fn((_file: CollectionFileDescriptor) => gate);
    const { repository } = readFixture(download);
    const first = repository.read(collectionId("reading"), "files/0.png");
    const second = repository.read(collectionId("reading"), "files/1.png");
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(2));
    const abort = new AbortController();
    const queued = repository.read(collectionId("reading"), "files/2.png", undefined, {
      signal: abort.signal,
    });
    abort.abort(new Error("Cancelled while queued"));
    await expect(queued).rejects.toThrow("Cancelled while queued");
    release(new Blob(["PNG"]));
    await Promise.all([first, second]);
    await repository.read(collectionId("reading"), "files/3.png");
    expect(download).toHaveBeenCalledTimes(3);
    expect(download.mock.calls.some(([file]) => file.path === "files/2.png")).toBe(false);
  });

  it("does not hold queued reads behind one slow download", async () => {
    let release: (blob: Blob) => void = () => {
      throw new Error("Uninitialized gate");
    };
    const gate = new Promise<Blob>((resolve) => {
      release = resolve;
    });
    const download = vi.fn((file: CollectionFileDescriptor) =>
      file.path === "files/0.png" ? gate : Promise.resolve(new Blob(["PNG"])),
    );
    const { repository } = readFixture(download);
    const slow = repository.read(collectionId("reading"), "files/0.png");
    const others = await Promise.all(
      [1, 2, 3].map((index) =>
        repository.read(collectionId("reading"), `files/${String(index)}.png`),
      ),
    );
    expect(others).toHaveLength(3);
    release(new Blob(["PNG"]));
    await slow;
  });

  it("does not poison a read lane after a failed download", async () => {
    const download = vi
      .fn<(file: CollectionFileDescriptor) => Promise<Blob>>()
      .mockRejectedValueOnce(new Error("Download failed"))
      .mockResolvedValue(new Blob(["PNG"]));
    const { repository } = readFixture(download);
    const results = await Promise.allSettled(
      [0, 1, 2].map((index) =>
        repository.read(collectionId("reading"), `files/${String(index)}.png`),
      ),
    );
    expect(results.map((result) => result.status)).toEqual(["rejected", "fulfilled", "fulfilled"]);
    expect(download).toHaveBeenCalledTimes(3);
  });
});

function readFixture(download: (file: CollectionFileDescriptor) => Promise<Blob>): {
  repository: ConnectCollectionFileRepository;
  list: Mock<() => AsyncGenerator<CollectionFileDescriptor>>;
} {
  const list = vi.fn(async function* (): AsyncGenerator<CollectionFileDescriptor> {
    await Promise.resolve();
    for (let index = 0; index < 11; index++) {
      yield {
        fileId: `file-${String(index)}`,
        path: `files/${String(index)}.png`,
        revision: "file-revision",
        contentDigest: `sha256:${"a".repeat(64)}`,
        size: 3,
        mediaType: "image/png",
        mediaClass: "image",
        modifiedAt: "2026-09-24T00:00:00Z",
      };
    }
  });
  return { repository: new ConnectCollectionFileRepository({ list, download }), list };
}

describe("ConnectCollectionFileRepository", () => {
  it("exports an exact original revision and reuses its folder index", async () => {
    const revision: `sha256:${string}` = `sha256:${"a".repeat(64)}`;
    const cropRevision: `sha256:${string}` = `sha256:${"b".repeat(64)}`;
    const list = vi.fn(async function* (): AsyncGenerator<CollectionFileDescriptor> {
      await Promise.resolve();
      yield {
        fileId: "file-01",
        path: "files/reading/paper.pdf",
        revision: "file-rev-1",
        contentDigest: revision,
        size: 4,
        mediaType: "application/pdf",
        mediaClass: "pdf" as const,
        modifiedAt: "2026-08-09T00:00:00Z",
      };
      yield {
        fileId: "file-02",
        path: "files/reading/crop.png",
        revision: "file-rev-2",
        contentDigest: cropRevision,
        size: 3,
        mediaType: "image/png",
        mediaClass: "image" as const,
        modifiedAt: "2026-08-09T00:00:00Z",
      };
    });
    const download = vi.fn((descriptor: { readonly path: string }) =>
      Promise.resolve(new Blob([descriptor.path.endsWith("pdf") ? "PDF!" : "PNG"])),
    );
    const repository = new ConnectCollectionFileRepository({ list, download });

    await expect(
      repository.read(
        collectionId("reading"),
        "[[files/reading/paper.pdf]]",
        fileRevision(revision),
      ),
    ).resolves.toMatchObject({
      path: "files/reading/paper.pdf",
      mediaType: "application/pdf",
      bytes: new Uint8Array([80, 68, 70, 33]),
    });
    await repository.read(collectionId("reading"), "files/reading/crop.png");
    expect(list).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledTimes(2);
  });

  it("refuses to export a different file revision", async () => {
    const currentRevision: `sha256:${string}` = `sha256:${"c".repeat(64)}`;
    const oldRevision: `sha256:${string}` = `sha256:${"d".repeat(64)}`;
    const list = async function* (): AsyncGenerator<CollectionFileDescriptor> {
      await Promise.resolve();
      yield {
        fileId: "file-01",
        path: "files/paper.pdf",
        revision: "file-rev-1",
        contentDigest: currentRevision,
        size: 4,
        mediaClass: "pdf" as const,
        modifiedAt: "2026-08-09T00:00:00Z",
      };
    };
    const repository = new ConnectCollectionFileRepository({
      list,
      download: vi.fn(),
    });

    await expect(
      repository.read(collectionId("reading"), "files/paper.pdf", fileRevision(oldRevision)),
    ).rejects.toThrow("file_revision_changed");
  });
});

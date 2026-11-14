import { mdbaseError } from "@mdbase-dev/sdk";
import { collectionId, fileRevision } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectCollectionFileRepository } from "./collection-files.js";
import { testFile } from "./records.fixtures.js";

import type { ReaderFileClient } from "./documents.js";
import type { FileView } from "@mdbase-dev/sdk";
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
    const { repository, get } = readFixture(download);
    const files = await Promise.all(
      Array.from({ length: 11 }, (_, index) =>
        repository.read(collectionId("reading"), `files/${String(index)}.png`),
      ),
    );
    expect(files).toHaveLength(11);
    expect(maximum).toBe(2);
    expect(get).toHaveBeenCalledTimes(11);
    expect(download).toHaveBeenCalledTimes(11);
  });

  it("cancels queued reads promptly without starting their I/O", async () => {
    let release: (blob: Blob) => void = () => {
      throw new Error("Uninitialized gate");
    };
    const gate = new Promise<Blob>((resolve) => {
      release = resolve;
    });
    const download = vi.fn((_file: FileView) => gate);
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
    const download = vi.fn((file: FileView) =>
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
      .fn<(file: FileView) => Promise<Blob>>()
      .mockRejectedValueOnce(new Error("Download failed"))
      .mockResolvedValue(new Blob(["PNG"]));
    const { repository } = readFixture(download);
    const records = await Promise.allSettled(
      [0, 1, 2].map((index) =>
        repository.read(collectionId("reading"), `files/${String(index)}.png`),
      ),
    );
    expect(records.map((result) => result.status)).toEqual(["rejected", "fulfilled", "fulfilled"]);
    expect(download).toHaveBeenCalledTimes(3);
  });
});

function readFixture(download: (file: FileView) => Promise<Blob>): {
  repository: ConnectCollectionFileRepository;
  get: Mock<ReaderFileClient["get"]>;
} {
  const get = vi.fn<ReaderFileClient["get"]>((target) => {
    const index = Number(
      (typeof target === "string" ? target : target.path).split("/").at(-1)?.split(".")[0],
    );
    return Promise.resolve(
      testFile({
        id: `file-${String(index)}`,
        path: `files/${String(index)}.png`,
        digest: `sha256:${"a".repeat(64)}`,
        size: 3,
        mediaType: "image/png",
        media: "image",
      }),
    );
  });
  return { repository: new ConnectCollectionFileRepository({ get: get, download }), get };
}

describe("size-limited collection file reads", () => {
  it("refuses an oversized file from get before downloading it", async () => {
    const download = vi.fn().mockResolvedValue(new Blob(["PNG"]));
    const { repository } = readFixture(download);
    await expect(
      repository.read(collectionId("reading"), "files/0.png", undefined, { maxBytes: 2 }),
    ).rejects.toThrow("file_too_large");
    expect(download).not.toHaveBeenCalled();
  });

  it("checks downloaded size before allocating a byte buffer and releases its lane", async () => {
    const blob = new Blob(["oversized"]);
    const arrayBuffer = vi.spyOn(blob, "arrayBuffer");
    const download = vi
      .fn()
      .mockResolvedValueOnce(blob)
      .mockResolvedValue(new Blob(["PNG"]));
    const { repository } = readFixture(download);
    await expect(
      repository.read(collectionId("reading"), "files/0.png", undefined, { maxBytes: 3 }),
    ).rejects.toThrow("file_too_large");
    expect(arrayBuffer).not.toHaveBeenCalled();
    await expect(
      repository.read(collectionId("reading"), "files/1.png", undefined, { maxBytes: 3 }),
    ).resolves.toMatchObject({ bytes: new Uint8Array([80, 78, 71]) });
  });

  it("does not start a download if cancelled during get", async () => {
    const abort = new AbortController();
    const download = vi.fn();
    const fixture = readFixture(download);
    const original = fixture.get.getMockImplementation()!;
    fixture.get.mockImplementation(async (target, options) => {
      const result = await original(target, options);
      abort.abort();
      return result;
    });
    await expect(
      fixture.repository.read(collectionId("reading"), "files/0.png", undefined, {
        signal: abort.signal,
        maxBytes: 3,
      }),
    ).rejects.toThrow();
    expect(download).not.toHaveBeenCalled();
  });
});

describe("ConnectCollectionFileRepository", () => {
  it("exports exact revisions using fresh point metadata rather than a folder index", async () => {
    const revision: `sha256:${string}` = `sha256:${"a".repeat(64)}`;
    const cropRevision: `sha256:${string}` = `sha256:${"b".repeat(64)}`;
    const list = vi.fn(async function* (): AsyncGenerator<FileView> {
      await Promise.resolve();
      yield {
        id: "file-01",
        state: "materialized",
        confirmedSeq: 1,
        path: "files/reading/paper.pdf",
        digest: revision,
        size: 4,
        mediaType: "application/pdf",
        media: "pdf" as const,
        mtime: Date.parse("2026-08-09T00:00:00Z"),
      };
      yield {
        id: "file-02",
        state: "materialized",
        confirmedSeq: 1,
        path: "files/reading/crop.png",
        digest: cropRevision,
        size: 3,
        mediaType: "image/png",
        media: "image" as const,
        mtime: Date.parse("2026-08-09T00:00:00Z"),
      };
    });
    const download = vi.fn((descriptor: { readonly path: string }) =>
      Promise.resolve(new Blob([descriptor.path.endsWith("pdf") ? "PDF!" : "PNG"])),
    );
    const get = vi.fn<ReaderFileClient["get"]>(async (target) => {
      for await (const file of list()) {
        if (file.path === (typeof target === "string" ? target : target.path)) {
          return file;
        }
      }
      throw mdbaseError("not_found", "File not found");
    });
    const repository = new ConnectCollectionFileRepository({ get, download });

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
    expect(get.mock.calls.map(([target]) => target)).toEqual([
      { path: "files/reading/paper.pdf" },
      { path: "files/reading/crop.png" },
    ]);
    expect(download).toHaveBeenCalledTimes(2);
  });

  it("refuses to export a different file revision", async () => {
    const currentRevision: `sha256:${string}` = `sha256:${"c".repeat(64)}`;
    const oldRevision: `sha256:${string}` = `sha256:${"d".repeat(64)}`;
    const list = async function* (): AsyncGenerator<FileView> {
      await Promise.resolve();
      yield {
        id: "file-01",
        state: "materialized",
        confirmedSeq: 1,
        path: "files/paper.pdf",
        digest: currentRevision,
        size: 4,
        media: "pdf" as const,
        mtime: Date.parse("2026-08-09T00:00:00Z"),
      };
    };
    const repository = new ConnectCollectionFileRepository({
      get: async () => {
        const result = await list().next();
        if (result.done) {
          throw mdbaseError("not_found", "Missing");
        }
        return result.value;
      },
      download: vi.fn(),
    });

    await expect(
      repository.read(collectionId("reading"), "files/paper.pdf", fileRevision(oldRevision)),
    ).rejects.toThrow("file_revision_changed");
  });
});

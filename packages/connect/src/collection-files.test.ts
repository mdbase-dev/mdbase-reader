import { collectionId, fileRevision } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectCollectionFileRepository } from "./collection-files.js";

import type { CollectionFileDescriptor } from "@mdbase-dev/connect";

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

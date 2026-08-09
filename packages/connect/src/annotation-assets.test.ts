import { collectionId, mutationId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectAnnotationAssetRepository } from "./annotation-assets.js";

describe("ConnectAnnotationAssetRepository", () => {
  it("uploads a PNG with a stable transfer identity", async () => {
    const upload = vi.fn().mockResolvedValue({ path: "files/annotation-ann_01.png" });
    const repository = new ConnectAnnotationAssetRepository({ upload });

    await repository.store({
      collectionId: collectionId("reading"),
      path: "files/annotation-ann_01.png",
      bytes: new Uint8Array([137, 80, 78, 71]),
      mediaType: "image/png",
      idempotencyKey: mutationId("mutation-1"),
    });

    expect(upload).toHaveBeenCalledOnce();
    const [path, blob, options] = upload.mock.calls[0] as [string, Blob, Record<string, string>];
    expect(path).toBe("files/annotation-ann_01.png");
    expect(blob.type).toBe("image/png");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(options).toEqual({ mediaType: "image/png", transferId: "mutation-1" });
  });
});

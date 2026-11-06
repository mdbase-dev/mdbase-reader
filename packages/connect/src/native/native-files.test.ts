import { describe, expect, it, vi, type Mock } from "vitest";

import { nativeReaderFiles, type NativeReaderFileClient } from "./native-files.js";

import type { CollectionFileDescriptor } from "@mdbase-dev/connect";
import type { MdbaseClient, FileView } from "@mdbase-dev/sdk";

function fixture(state = "confirmed"): {
  files: { grant: null; upload: Mock; get: Mock; list: () => AsyncGenerator<FileView> };
  awaitReceipt: Mock;
  stateOf: Mock;
  adapter: NativeReaderFileClient;
} {
  const files = {
    grant: null,
    upload: vi.fn().mockResolvedValue({ mutationId: "mutation", fileId: "file" }),
    get: vi.fn().mockResolvedValue({
      id: "file",
      path: "reading.html",
      digest: "sha256:abc",
      size: 12,
      media: "document",
    }),
    list: async function* () {
      yield await files.get();
    },
  };
  const awaitReceipt = vi.fn().mockResolvedValue({ state });
  const stateOf = vi.fn().mockReturnValue("saved");
  const client = { files, awaitReceipt, ledger: { stateOf } } as unknown as MdbaseClient;
  return { files, awaitReceipt, stateOf, adapter: nativeReaderFiles(client) };
}

describe("native file confirmation", () => {
  it("reads the file only after the collection confirms it", async () => {
    const { adapter, files, awaitReceipt } = fixture();
    await expect(adapter.upload("reading.html", new Blob(["reading"]))).resolves.toMatchObject({
      fileId: "file",
    });
    expect(awaitReceipt).toHaveBeenCalledWith("mutation", 30_000, undefined);
    expect(files.get).toHaveBeenCalledOnce();
  });

  it("ends an unconfirmed wait without replaying the upload or claiming success", async () => {
    const { adapter, files } = fixture("pending");
    await expect(adapter.upload("reading.html", new Blob(["reading"]))).rejects.toThrow(
      "No source was created",
    );
    expect(files.upload).toHaveBeenCalledOnce();
    expect(files.get).not.toHaveBeenCalled();
  });

  it("reports a refused acknowledgement without reading back an optimistic file", async () => {
    const { adapter, files } = fixture("rejected");
    await expect(adapter.upload("reading.html", new Blob(["reading"]))).rejects.toThrow(
      "The collection refused this file",
    );
    expect(files.upload).toHaveBeenCalledOnce();
    expect(files.get).not.toHaveBeenCalled();
  });

  it("settles cancellation while confirmation is held", async () => {
    const { adapter, awaitReceipt, files } = fixture();
    const controller = new AbortController();
    awaitReceipt.mockImplementation(
      (_id, _timeout, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason as Error), { once: true });
        }),
    );
    const adding = adapter.upload("reading.html", new Blob(["reading"]), {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(awaitReceipt).toHaveBeenCalledOnce());
    controller.abort();
    await expect(adding).rejects.toMatchObject({ name: "AbortError" });
    expect(files.get).not.toHaveBeenCalled();
    expect(files.upload).toHaveBeenCalledOnce();
  });

  it("does not mistake an optimistic file for a recoverable durable upload", async () => {
    const { adapter, stateOf, files } = fixture();
    stateOf.mockReturnValue("saving");
    const collect = async (): Promise<CollectionFileDescriptor[]> => {
      const entries = [];
      for await (const entry of adapter.list()) {
        entries.push(entry);
      }
      return entries;
    };
    await expect(collect()).rejects.toThrow("still waiting for confirmation");
    expect(files.upload).not.toHaveBeenCalled();
  });
});

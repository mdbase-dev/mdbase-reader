import { describe, expect, it, vi, type Mock } from "vitest";

import { digest, plan, recordDocument, success } from "../source-imports.fixtures.js";
import { ConnectSourceImportRepository } from "../source-imports.js";

import { nativeReaderFiles, type NativeReaderFileClient } from "./native-files.js";

import type { CollectionFileDescriptor } from "../connect-types.js";
import type { ReaderConnectClient } from "../repository-client.js";
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

  it("recovers a matching confirmed upload despite an unrelated pending file", async () => {
    const { adapter, files, stateOf } = fixture();
    files.list = async function* () {
      const view = (await files.get()) as FileView;
      yield { ...view, id: "pending-file", digest: "sha256:unrelated" };
      yield { ...view, digest };
    };
    stateOf.mockImplementation((id: string) => (id === "pending-file" ? "saving" : "saved"));
    const create = vi.fn().mockResolvedValue(success(recordDocument()));
    const repository = new ConnectSourceImportRepository(
      { create } as unknown as ReaderConnectClient,
      adapter,
    );
    await expect(
      repository.commitFile(plan(), { recoverExistingFiles: true }),
    ).resolves.toMatchObject({
      id: "src_import",
    });
    expect(create).toHaveBeenCalledOnce();
    expect(files.upload).not.toHaveBeenCalled();
    expect(stateOf).not.toHaveBeenCalledWith("pending-file");
  });

  it.each(["saving", "saved_on_device", "rejected"])(
    "does not duplicate a matching %s upload during recovery",
    async (state) => {
      const { adapter, files, stateOf } = fixture();
      files.list = async function* () {
        const view = (await files.get()) as FileView;
        yield { ...view, digest };
      };
      stateOf.mockReturnValue(state);
      const create = vi.fn();
      const repository = new ConnectSourceImportRepository(
        { create } as unknown as ReaderConnectClient,
        adapter,
      );
      await expect(repository.commitFile(plan(), { recoverExistingFiles: true })).rejects.toThrow(
        "still waiting for confirmation",
      );
      expect(files.upload).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );
});

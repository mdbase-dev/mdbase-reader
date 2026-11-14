import { describe, expect, it, vi, type Mock } from "vitest";

import { mockSdk, testWrite } from "../records.fixtures.js";
import { digest, plan, recordDocument, success } from "../source-imports.fixtures.js";
import { ConnectSourceImportRepository } from "../source-imports.js";

import { nativeReaderFiles, type NativeReaderFileClient } from "./native-files.js";

import type { MdbaseClient, FileView } from "@mdbase-dev/sdk";

function fixture(state = "confirmed"): {
  files: { grant: null; upload: Mock; get: Mock; list: () => AsyncGenerator<FileView> };
  settle: Mock;
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
      media: "other",
      state: "materialized",
      confirmedSeq: 1,
    }),
    list: async function* () {
      yield await files.get();
    },
  };
  const settle = vi.fn().mockResolvedValue(
    state === "rejected"
      ? {
          outcome: "rejected",
          problem: {
            code: "conflict",
            recovery: "resolve_conflict",
            message: "The collection refused this file",
          },
        }
      : { outcome: state === "confirmed" ? "confirmed" : "saved_on_device" },
  );
  const stateOf = vi.fn().mockReturnValue("saved");
  const client = { files, settle, ledger: { stateOf } } as unknown as MdbaseClient;
  return { files, settle, stateOf, adapter: nativeReaderFiles(client) };
}

describe("native file confirmation", () => {
  it("reads the file only after the collection confirms it", async () => {
    const { adapter, files, settle } = fixture();
    await expect(adapter.upload("reading.html", new Blob(["reading"]))).resolves.toMatchObject({
      id: "file",
    });
    expect(settle).toHaveBeenCalledWith(
      { mutationId: "mutation", fileId: "file" },
      { timeoutMs: 30_000 },
    );
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
    const { adapter, settle, files } = fixture();
    const controller = new AbortController();
    settle.mockImplementation(
      (_id, { signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason as Error), { once: true });
        }),
    );
    const adding = adapter.upload("reading.html", new Blob(["reading"]), {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(settle).toHaveBeenCalledOnce());
    controller.abort();
    await expect(adding).rejects.toMatchObject({ name: "AbortError" });
    expect(files.get).not.toHaveBeenCalled();
    expect(files.upload).toHaveBeenCalledOnce();
  });

  it("does not mistake an optimistic file for a recoverable durable upload", async () => {
    const { adapter, stateOf, files } = fixture();
    stateOf.mockReturnValue("saving");
    const collect = async (): Promise<FileView[]> => {
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
    const create = vi.fn().mockResolvedValue(testWrite(success(recordDocument())));
    const repository = new ConnectSourceImportRepository(mockSdk({ create }), adapter);
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
      const repository = new ConnectSourceImportRepository(mockSdk({ create }), adapter);
      await expect(repository.commitFile(plan(), { recoverExistingFiles: true })).rejects.toThrow(
        "still waiting for confirmation",
      );
      expect(files.upload).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );
});

import "fake-indexeddb/auto";

import {
  collectionId,
  fileId,
  fileRevision,
  type DocumentHandle,
  type DocumentTarget,
} from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import {
  keepOfflineDocument,
  openDocumentWithOfflineCopy,
  openOfflineDocument,
  removeOfflineDocument,
  verifyOfflineBytes,
} from "./offline-documents.js";

async function fixture(text: string): Promise<{ target: DocumentTarget; handle: DocumentHandle }> {
  const blob = new Blob([text], { type: "text/html" });
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const revision = fileRevision(
    `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
  );
  const target = { fileId: fileId(`file-${text}`), file: "[[files/test.html]]", revision };
  const url = URL.createObjectURL(blob);
  return {
    target,
    handle: {
      ...target,
      url,
      mediaType: blob.type,
      close: () => {
        URL.revokeObjectURL(url);
        return Promise.resolve();
      },
    },
  };
}

describe("opt-in exact-revision offline copies", () => {
  it("opens only the stored collection, identity and revision, then removes just that copy", async () => {
    const { target, handle } = await fixture("<p>Test offline</p>");
    const collection = collectionId("offline-test");
    await keepOfflineDocument(collection, target, handle);
    await handle.close();
    const cached = await openOfflineDocument(collection, target);
    expect(await (await fetch(cached!.url)).text()).toBe("<p>Test offline</p>");
    await cached!.close();
    expect(await openOfflineDocument(collectionId("different"), target)).toBeNull();
    expect(
      await openOfflineDocument(collection, {
        ...target,
        revision: fileRevision(`sha256:${"0".repeat(64)}`),
      }),
    ).toBeNull();
    await removeOfflineDocument(collection, target);
    expect(await openOfflineDocument(collection, target)).toBeNull();
  });
  it("prefers the current online file over an older offline copy, but retains offline fallback", async () => {
    const { target, handle } = await fixture("Earlier version");
    const collection = collectionId("offline-updated-file");
    await keepOfflineDocument(collection, target, handle);
    const updated = await fixture("Current version");
    const repository = { open: vi.fn().mockResolvedValue(updated.handle) };
    const online = await openDocumentWithOfflineCopy(collection, target, repository, {});
    expect(online.handle.revision).toBe(updated.handle.revision);
    expect(online.cached).toBe(false);
    repository.open.mockRejectedValueOnce(new Error("connection unavailable"));
    const offline = await openDocumentWithOfflineCopy(collection, target, repository, {});
    expect(offline.handle.revision).toBe(target.revision);
    expect(offline.cached).toBe(true);
    await offline.handle.close();
    await removeOfflineDocument(collection, target);
    await updated.handle.close();
    await handle.close();
  });

  it("does not present an offline copy as a replacement for a deleted file", async () => {
    const { target, handle } = await fixture("Deleted file");
    const collection = collectionId("offline-deleted-file");
    await keepOfflineDocument(collection, target, handle);
    await expect(
      openDocumentWithOfflineCopy(
        collection,
        target,
        { open: vi.fn().mockRejectedValue(new Error("file_not_found")) },
        {},
      ),
    ).rejects.toThrow("file_not_found");
    await removeOfflineDocument(collection, target);
    await handle.close();
  });

  it("rejects corrupt or wrong-revision bytes instead of silently using them", async () => {
    const { target, handle } = await fixture("Expected");
    await expect(verifyOfflineBytes(new Blob(["Changed"]), target)).rejects.toThrow(
      "exact file revision",
    );
    await handle.close();
  });
});

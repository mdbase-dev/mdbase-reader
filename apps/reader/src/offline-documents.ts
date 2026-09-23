import type {
  CollectionId,
  DocumentHandle,
  DocumentTarget,
  DocumentRepository,
  DocumentOpenOptions,
} from "@mdbase-reader/core";

export async function openDocumentWithOfflineCopy(
  collection: CollectionId,
  target: DocumentTarget,
  repository: DocumentRepository,
  options: DocumentOpenOptions,
): Promise<{ readonly handle: DocumentHandle; readonly cached: boolean }> {
  try {
    // Check the current file before considering a device-local copy. An offline
    // copy is deliberately a fallback, not a way to hide a changed online file.
    const handle = await repository.open(collection, target, options);
    const current = { ...target, fileId: handle.fileId, revision: handle.revision };
    const copy = await openOfflineDocument(collection, current).catch(() => null);
    await copy?.close();
    return { handle, cached: copy !== null };
  } catch (reason) {
    if (options.signal?.aborted || isMissingFile(reason)) {
      throw reason;
    }
    const cached = await openOfflineDocument(collection, target).catch(() => null);
    if (cached) {
      return { handle: cached, cached: true };
    }
    throw reason;
  }
}

function isMissingFile(reason: unknown): boolean {
  return reason instanceof Error && reason.message.includes("file_not_found");
}

const databaseName = "mdbase-reader-offline-v1";
const maximumFileBytes = 64 * 1024 * 1024;
const maximumCacheBytes = 128 * 1024 * 1024;
interface CachedDocument {
  readonly key: string;
  readonly blob: Blob;
  readonly mediaType: string;
  readonly size: number;
}
function key(collection: CollectionId, target: DocumentTarget): string {
  return JSON.stringify([collection, target.fileId, target.revision]);
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("documents", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage unavailable"));
    request.onblocked = () =>
      reject(new Error("Close other Reader tabs to enable offline storage."));
  });
}
function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage failed"));
  });
}
function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Offline storage transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Offline storage transaction failed"));
  });
}

export async function verifyOfflineBytes(blob: Blob, target: DocumentTarget): Promise<void> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const revision = `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  if (revision !== target.revision) {
    throw new Error("Offline copy does not match this exact file revision. Download it again.");
  }
}

export async function openOfflineDocument(
  collection: CollectionId,
  target: DocumentTarget,
): Promise<DocumentHandle | null> {
  const database = await openDatabase();
  try {
    const cached = (await requestValue(
      database.transaction("documents").objectStore("documents").get(key(collection, target)),
    )) as CachedDocument | undefined;
    if (!cached) {
      return null;
    }
    await verifyOfflineBytes(cached.blob, target);
    const url = URL.createObjectURL(cached.blob);
    return {
      fileId: target.fileId,
      revision: target.revision,
      mediaType: cached.mediaType,
      url,
      close: () => {
        URL.revokeObjectURL(url);
        return Promise.resolve();
      },
    };
  } finally {
    database.close();
  }
}

export async function keepOfflineDocument(
  collection: CollectionId,
  target: DocumentTarget,
  handle: DocumentHandle,
): Promise<void> {
  const response = await fetch(handle.url);
  if (!response.ok) {
    throw new Error("Could not read the open document for offline storage.");
  }
  const blob = await response.blob();
  if (blob.size > maximumFileBytes) {
    throw new Error("Offline copies are limited to 64 MB per document.");
  }
  await verifyOfflineBytes(blob, target);
  const database = await openDatabase();
  try {
    const transaction = database.transaction("documents", "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore("documents");
    const cacheKey = key(collection, target);
    // Keep the budget check and write in one transaction across browser tabs.
    const request = store.openCursor();
    let size = blob.size;
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const entry = cursor.value as CachedDocument;
        if (entry.key !== cacheKey) {
          size += entry.size;
        }
        cursor.continue();
      } else if (size > maximumCacheBytes) {
        transaction.abort();
      } else {
        store.put({
          key: cacheKey,
          blob,
          size: blob.size,
          mediaType: handle.mediaType,
        } satisfies CachedDocument);
      }
    };
    try {
      await done;
    } catch {
      throw new Error(
        "Offline storage is full or unavailable (128 MB limit). Remove an offline copy and retry.",
      );
    }
  } finally {
    database.close();
  }
}

export async function removeOfflineDocument(
  collection: CollectionId,
  target: DocumentTarget,
): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("documents", "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore("documents").delete(key(collection, target));
    await done;
  } finally {
    database.close();
  }
}

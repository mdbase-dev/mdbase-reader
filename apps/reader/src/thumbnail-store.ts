/**
 * A remembered thumbnail: the small rendered image, or null when the file has none to give
 * (an EPUB without a cover, a file over the download limit). Keyed by the file's revision,
 * so an entry never goes stale; a changed file simply asks under a new key.
 */
export interface StoredThumbnail {
  readonly image: Blob | null;
  readonly pageCount?: number;
}

export interface ThumbnailStore {
  /** The stored thumbnail, or undefined when this key has never been stored. */
  get(key: string): Promise<StoredThumbnail | undefined>;
  put(key: string, thumbnail: StoredThumbnail): Promise<void>;
}

interface ThumbnailRecord {
  readonly key: string;
  /** Bytes rather than a Blob: every engine can store an ArrayBuffer. */
  readonly bytes: ArrayBuffer | null;
  readonly type: string;
  readonly pageCount?: number;
  readonly stored: number;
}

export const thumbnailDatabase = "mdbase-reader-thumbnails-v1";
/** About 100 small images: a few megabytes at most. */
export const thumbnailEntryLimit = 100;

const storeName = "thumbnails";
const storedIndex = "stored";

/** Thumbnails kept on this device across sessions; the oldest go first past the limit. */
export class IndexedDbThumbnailStore implements ThumbnailStore {
  #database: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly factory: IDBFactory,
    private readonly limit = thumbnailEntryLimit,
  ) {}

  async get(key: string): Promise<StoredThumbnail | undefined> {
    const record = await this.#request<ThumbnailRecord | undefined>("readonly", (store) =>
      store.get(key),
    );
    if (!record) {
      return undefined;
    }
    return {
      image: record.bytes ? new Blob([record.bytes], { type: record.type }) : null,
      ...(record.pageCount === undefined ? {} : { pageCount: record.pageCount }),
    };
  }

  async put(key: string, thumbnail: StoredThumbnail): Promise<void> {
    const record: ThumbnailRecord = {
      key,
      bytes: thumbnail.image ? await thumbnail.image.arrayBuffer() : null,
      type: thumbnail.image?.type ?? "",
      ...(thumbnail.pageCount === undefined ? {} : { pageCount: thumbnail.pageCount }),
      stored: Date.now(),
    };
    const database = await this.#open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      store.put(record);
      const count = store.count();
      count.onsuccess = () => {
        let excess = count.result - this.limit;
        if (excess <= 0) {
          return;
        }
        const cursor = store.index(storedIndex).openCursor();
        cursor.onsuccess = () => {
          const oldest = cursor.result;
          if (oldest && excess > 0) {
            excess -= 1;
            oldest.delete();
            oldest.continue();
          }
        };
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Thumbnail storage failed."));
    });
  }

  async #request<T>(
    mode: IDBTransactionMode,
    request: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> {
    const database = await this.#open();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const pending = request(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve(pending.result as T);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Thumbnail storage failed."));
    });
  }

  #open(): Promise<IDBDatabase> {
    this.#database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(thumbnailDatabase, 1);
      request.onupgradeneeded = () => {
        request.result
          .createObjectStore(storeName, { keyPath: "key" })
          .createIndex(storedIndex, "stored");
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          this.#database = null;
        };
        resolve(database);
      };
      request.onerror = () => reject(request.error ?? new Error("Thumbnail storage unavailable."));
      request.onblocked = () =>
        reject(new Error("Thumbnail storage is blocked by another window."));
    }).catch((reason: unknown) => {
      this.#database = null;
      throw reason;
    });
    return this.#database;
  }
}

/** The device's thumbnail store, or none where IndexedDB is unavailable. */
export function deviceThumbnailStore(): ThumbnailStore | undefined {
  try {
    return typeof indexedDB === "undefined" ? undefined : new IndexedDbThumbnailStore(indexedDB);
  } catch {
    return undefined;
  }
}

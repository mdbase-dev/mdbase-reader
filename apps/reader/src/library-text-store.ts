export interface LibraryTextEntry {
  readonly key: string;
  readonly collection: string;
  readonly fileId: string;
  readonly revision: string;
  readonly text: string;
}

interface CatalogEntry {
  readonly key: string;
  readonly bytes: number;
  readonly created: number;
}

export const libraryTextDatabase = "mdbase-reader-library-text-v1";
export const libraryTextBudget = 32 * 1024 * 1024;
const entryLimit = 2048;

export function libraryTextKey(collection: string, fileId: string): string {
  return JSON.stringify([collection, fileId]);
}

/** Atomic, origin-wide FIFO eviction; one slot per file, never historical revisions. */
export class LibraryTextStore {
  constructor(
    private readonly factory: IDBFactory = indexedDB,
    private readonly budget = libraryTextBudget,
  ) {}

  async list(collection: string): Promise<LibraryTextEntry[]> {
    return this.transaction("readonly", (transaction, done) => {
      const entries: LibraryTextEntry[] = [];
      const request = transaction.objectStore("entries").openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const entry = cursor.value as LibraryTextEntry;
          if (entry.collection === collection) {
            entries.push(entry);
          }
          cursor.continue();
        } else {
          done(entries);
        }
      };
    });
  }

  async put(entry: LibraryTextEntry): Promise<readonly string[]> {
    const bytes =
      2 *
        (entry.text.length +
          2 * entry.key.length +
          entry.revision.length +
          entry.collection.length +
          entry.fileId.length) +
      512;
    if (bytes > this.budget) {
      throw new Error("Document text exceeds the local index budget.");
    }
    return this.transaction("readwrite", (transaction, done) => {
      const catalog = transaction.objectStore("catalog");
      const entries = transaction.objectStore("entries");
      const request = catalog.getAll();
      request.onsuccess = () => {
        const rows = (request.result as CatalogEntry[])
          .filter((row) => row.key !== entry.key)
          .sort((left, right) => left.created - right.created || left.key.localeCompare(right.key));
        let total = rows.reduce((sum, row) => sum + row.bytes, bytes);
        const removed: string[] = [];
        while (total > this.budget || rows.length >= entryLimit) {
          const oldest = rows.shift();
          if (!oldest) {
            break;
          }
          total -= oldest.bytes;
          removed.push(oldest.key);
          catalog.delete(oldest.key);
          entries.delete(oldest.key);
        }
        const created = Math.max(Date.now(), (rows.at(-1)?.created ?? 0) + 1);
        catalog.put({ key: entry.key, bytes, created });
        entries.put(entry);
        done(removed);
      };
    });
  }

  async remove(keys: readonly string[]): Promise<void> {
    return this.transaction("readwrite", (transaction, done) => {
      for (const key of keys) {
        transaction.objectStore("entries").delete(key);
        transaction.objectStore("catalog").delete(key);
      }
      done(undefined);
    });
  }

  private async transaction<T>(
    mode: IDBTransactionMode,
    work: (transaction: IDBTransaction, done: (value: T) => void) => void,
  ): Promise<T> {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(["entries", "catalog"], mode);
      let result: T;
      transaction.oncomplete = () => {
        database.close();
        resolve(result);
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error("Local text storage failed."));
      };
      work(transaction, (value) => {
        result = value;
      });
    });
  }

  private async open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.factory.open(libraryTextDatabase, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("entries", { keyPath: "key" });
        request.result.createObjectStore("catalog", { keyPath: "key" });
      };
      let abandoned = false;
      request.onsuccess = () => {
        if (abandoned) {
          request.result.close();
        } else {
          request.result.onversionchange = () => request.result.close();
          resolve(request.result);
        }
      };
      request.onerror = () => reject(request.error ?? new Error("Local text storage unavailable."));
      request.onblocked = () => {
        abandoned = true;
        reject(new Error("Local text storage is blocked by another window."));
      };
    });
  }
}

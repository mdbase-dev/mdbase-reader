import type { IndexedFile, LibraryTextHit } from "./library-text-index.js";
import type { LibraryTextCommand, LibraryTextResponse } from "./library-text-worker.js";

/** Collection-owned worker; terminating rejects outstanding work and releases all text. */
export class LibraryTextClient {
  private readonly worker = new Worker(new URL("./library-text-worker.ts", import.meta.url), {
    type: "module",
    name: "reader-library-text",
  });
  private sequence = 0;
  private closed = false;
  private readonly pending = new Map<
    number,
    { resolve: (value: LibraryTextResponse["value"]) => void; reject: (reason: Error) => void }
  >();

  constructor(onFailure?: () => void) {
    this.worker.onmessage = (event: MessageEvent<LibraryTextResponse>) => {
      const { id, value, failed } = event.data;
      const pending = this.pending.get(id);
      this.pending.delete(id);
      if (failed) {
        pending?.reject(new Error("Local document index unavailable."));
      } else {
        pending?.resolve(value);
      }
    };
    this.worker.onerror = () => {
      this.close();
      onFailure?.();
    };
  }

  async open(collection: string): Promise<void> {
    await this.request({ method: "open", collection });
  }

  async reconcile(files: readonly IndexedFile[], complete: boolean): Promise<readonly string[]> {
    return (await this.request({ method: "reconcile", files, complete })) as readonly string[];
  }

  async put(file: IndexedFile, text: string): Promise<void> {
    await this.request({ method: "put", file, text });
  }

  async search(query: string): Promise<readonly LibraryTextHit[]> {
    return (await this.request({ method: "search", query })) as readonly LibraryTextHit[];
  }

  close(): void {
    this.closed = true;
    this.worker.terminate();
    for (const { reject } of this.pending.values()) {
      reject(new Error("Local document index closed."));
    }
    this.pending.clear();
  }

  private async request(command: LibraryTextCommand): Promise<LibraryTextResponse["value"]> {
    if (this.closed) {
      throw new Error("Local document index closed.");
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...command, id });
    });
  }
}

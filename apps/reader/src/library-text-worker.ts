import { LibraryTextIndex } from "./library-text-index.js";
import { LibraryTextStore } from "./library-text-store.js";

import type { IndexedFile, LibraryTextHit } from "./library-text-index.js";

export type LibraryTextCommand =
  | { readonly method: "open"; readonly collection: string }
  | {
      readonly method: "reconcile";
      readonly files: readonly IndexedFile[];
      readonly complete: boolean;
    }
  | { readonly method: "put"; readonly file: IndexedFile; readonly text: string }
  | { readonly method: "search"; readonly query: string };
export interface LibraryTextResponse {
  readonly id: number;
  readonly value?: readonly string[] | readonly LibraryTextHit[] | undefined;
  readonly failed?: boolean;
}

let index: LibraryTextIndex | undefined;
let tail = Promise.resolve();
self.onmessage = (event: MessageEvent<LibraryTextCommand & { readonly id: number }>): void => {
  // Transactions are ordered, including reconcile vs an earlier write of an old revision.
  tail = tail.then(async () => {
    const { id, ...command } = event.data;
    try {
      const value = await execute(command);
      self.postMessage({ id, value } satisfies LibraryTextResponse);
    } catch {
      // Never send collection paths, content or storage diagnostics outside this worker.
      self.postMessage({ id, failed: true } satisfies LibraryTextResponse);
    }
  });
};

async function execute(command: LibraryTextCommand): Promise<LibraryTextResponse["value"]> {
  if (command.method === "open") {
    index = new LibraryTextIndex(command.collection, new LibraryTextStore());
    await index.load();
    return undefined;
  }
  if (!index) {
    throw new Error("Text index is not open.");
  }
  switch (command.method) {
    case "reconcile":
      return index.reconcile(command.files, command.complete);
    case "put":
      await index.put(command.file, command.text);
      return undefined;
    case "search":
      return index.search(command.query);
  }
}

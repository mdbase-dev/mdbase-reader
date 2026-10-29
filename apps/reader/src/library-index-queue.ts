import { isHtml } from "./document-media.js";

import type { LibraryTextClient } from "./library-text-client.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { DocumentDescriptor } from "@mdbase-reader/core";

/** DOM extraction is synchronous: refuse large inputs before download/allocation. */
export const libraryHtmlReadLimit = 256 * 1024;
export interface LibraryIndexProgress {
  readonly checked: number;
  readonly total: number;
  readonly skipped: number;
}

export interface LibraryIndexQueueOptions {
  readonly files: readonly DocumentDescriptor[];
  readonly complete: boolean;
  readonly client: Pick<LibraryTextClient, "reconcile" | "put">;
  readonly gateway: Pick<ReaderWorkspaceGateway, "readFile">;
  readonly signal: AbortSignal;
  readonly idle: (signal: AbortSignal) => Promise<void>;
  readonly extract: (bytes: Uint8Array) => string;
  /** Includes evictions/failures: don't churn the same revision on every metadata refresh. */
  readonly attempted: Set<string>;
  readonly report: (progress: LibraryIndexProgress) => void;
}

export function libraryFileRevisionKey(file: {
  readonly fileId: string;
  readonly revision: string;
}): string {
  return JSON.stringify([file.fileId, file.revision]);
}

/**
 * The documents library search reads. A web page's archive is the unprocessed snapshot:
 * its readable copy holds the same text, with navigation and other page furniture marked,
 * so indexing the archive only finds pages by their menus and footers.
 */
export function libraryIndexedDocuments(
  sources: readonly { readonly documents: readonly DocumentDescriptor[] }[],
): DocumentDescriptor[] {
  const files = new Map<string, DocumentDescriptor>();
  for (const { documents } of sources) {
    const readable = documents.some(
      (document) => document.role !== "archive" && isHtml(document.mediaType, document.file),
    );
    for (const document of documents) {
      if (!(readable && document.role === "archive")) {
        files.set(document.fileId, document);
      }
    }
  }
  return [...files.values()];
}

/** One read/extraction/write in flight. Storage errors escape to disable this session's index. */
export async function runLibraryIndexQueue(options: LibraryIndexQueueOptions): Promise<void> {
  const { client, files, complete, signal, attempted, report, gateway, idle, extract } = options;
  signal.throwIfAborted();
  const present = new Set(await client.reconcile(files, complete));
  signal.throwIfAborted();
  const supported = files.filter((file) => isHtml(file.mediaType, file.file));
  let checked = 0;
  let skipped = 0;
  let lastReport = performance.now();
  report({ checked, total: supported.length, skipped });
  for (const file of supported) {
    signal.throwIfAborted();
    const key = libraryFileRevisionKey(file);
    if (!present.has(file.fileId) && !attempted.has(key)) {
      // Each phase yields independently; input/reading can pause between IO and DOM work.
      await idle(signal);
      let text: string | undefined;
      try {
        const result = await gateway.readFile(file.file, file.revision, {
          signal,
          maxBytes: libraryHtmlReadLimit,
        });
        await idle(signal);
        signal.throwIfAborted();
        if (result.bytes.byteLength > libraryHtmlReadLimit) {
          throw new Error("Saved page exceeds the background extraction limit.");
        }
        text = extract(result.bytes);
      } catch {
        signal.throwIfAborted();
        skipped++;
        attempted.add(key);
        // File failures don't prevent the rest of the library from being indexed.
      }
      if (text !== undefined) {
        await idle(signal);
        signal.throwIfAborted();
        await client.put(file, text);
        signal.throwIfAborted();
        attempted.add(key);
      }
    } else if (!present.has(file.fileId)) {
      skipped++;
    }
    checked++;
    if (checked === supported.length || performance.now() - lastReport > 5000) {
      report({ checked, total: supported.length, skipped });
      lastReport = performance.now();
    }
  }
}

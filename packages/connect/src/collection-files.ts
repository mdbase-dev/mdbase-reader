import { ConnectDocumentError, type ReaderFileClient } from "./documents.js";

import type { CollectionFileDescriptor, MdbaseConnection } from "@mdbase-dev/connect";
import type {
  CollectionFileRepository,
  CollectionId,
  ExportedCollectionFile,
  FileRevision,
  ReaderRequestOptions,
} from "@mdbase-reader/core";

// A grid of screenshots must not fan out enough list/open/read requests to
// exhaust the hosted provider's admission slots. Leave room for other work.
const MAX_ACTIVE_READS = 2;

export class ConnectCollectionFileRepository implements CollectionFileRepository {
  readonly #descriptorsByPath = new Map<string, CollectionFileDescriptor>();
  readonly #loadedFolders = new Set<string>();
  readonly #readWaiters: (() => void)[] = [];
  #activeReads = 0;

  constructor(private readonly files: ReaderFileClient) {}

  async read(
    _collectionId: CollectionId,
    file: string,
    expectedRevision?: FileRevision,
    options: ReaderRequestOptions = {},
  ): Promise<ExportedCollectionFile> {
    options.signal?.throwIfAborted();
    const pending = this.#acquireRead(options.signal).then(async () => {
      try {
        options.signal?.throwIfAborted();
        return await this.#read(file, expectedRevision, options);
      } finally {
        this.#releaseRead();
      }
    });
    return abortableRead(pending, options.signal);
  }

  // Reads take whichever slot frees first, so one slow download never holds
  // up reads queued behind it while the other slot is idle.
  #acquireRead(signal?: AbortSignal): Promise<void> {
    if (this.#activeReads < MAX_ACTIVE_READS) {
      this.#activeReads++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const abort = (): void => {
        const index = this.#readWaiters.indexOf(waiter);
        if (index !== -1) {
          this.#readWaiters.splice(index, 1);
        }
        reject(abortError(signal));
      };
      const waiter = (): void => {
        signal?.removeEventListener("abort", abort);
        resolve();
      };
      this.#readWaiters.push(waiter);
      signal?.addEventListener("abort", abort, { once: true });
    });
  }

  // A released slot passes directly to the next waiter.
  #releaseRead(): void {
    const next = this.#readWaiters.shift();
    if (next) {
      next();
    } else {
      this.#activeReads--;
    }
  }

  async #read(
    file: string,
    expectedRevision: FileRevision | undefined,
    options: ReaderRequestOptions,
  ): Promise<ExportedCollectionFile> {
    const path = portableFilePath(file);
    const descriptor = await this.#find(path, options);
    if (!descriptor) {
      throw new ConnectDocumentError("export file", "file_not_found");
    }
    if (expectedRevision && descriptor.contentDigest !== expectedRevision) {
      throw new ConnectDocumentError("export file", "file_revision_changed");
    }
    const blob = options.signal
      ? await this.files.download(descriptor, options)
      : await this.files.download(descriptor);
    return {
      path: descriptor.path,
      mediaType: descriptor.mediaType ?? (blob.type || mediaTypeFromPath(descriptor.path)),
      bytes: new Uint8Array(await blob.arrayBuffer()),
    };
  }

  async #find(
    path: string,
    options: ReaderRequestOptions,
  ): Promise<CollectionFileDescriptor | null> {
    const cached = this.#descriptorsByPath.get(path);
    if (cached) {
      return cached;
    }
    const folder = parentFolder(path);
    if (!this.#loadedFolders.has(folder)) {
      for await (const descriptor of this.files.list({ folder, pageSize: 100, ...options })) {
        this.#descriptorsByPath.set(descriptor.path, descriptor);
      }
      this.#loadedFolders.add(folder);
    }
    return this.#descriptorsByPath.get(path) ?? null;
  }
}

function abortableRead<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return pending;
  }
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      reject(abortError(signal));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
    }
    void pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function abortError(signal?: AbortSignal): Error {
  const reason: unknown = signal?.reason;
  return reason instanceof Error ? reason : new DOMException("File read cancelled.", "AbortError");
}

function portableFilePath(link: string): string {
  const wikilink = /^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/u.exec(link.trim());
  return wikilink?.[1] ?? link.trim();
}

function parentFolder(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator > 0 ? path.slice(0, separator) : "";
}

function mediaTypeFromPath(path: string): string {
  const extension = path.split(".").at(-1)?.toLocaleLowerCase();
  if (extension === "pdf") {
    return "application/pdf";
  }
  if (extension === "epub") {
    return "application/epub+zip";
  }
  if (extension === "html" || extension === "htm") {
    return "text/html";
  }
  if (extension === "png") {
    return "image/png";
  }
  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }
  return "application/octet-stream";
}

export function connectCollectionFileRepository(
  connection: MdbaseConnection,
): ConnectCollectionFileRepository {
  return new ConnectCollectionFileRepository(connection.files);
}

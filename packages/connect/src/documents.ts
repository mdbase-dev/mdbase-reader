import {
  fileId as toFileId,
  fileRevision as toFileRevision,
  type CollectionId,
  type DocumentHandle,
  type DocumentOpenOptions,
  type DocumentRepository,
  type DocumentTarget,
} from "@mdbase-reader/core";

import type { CollectionFileDescriptor, MdbaseConnection } from "@mdbase-dev/connect";

export interface ReaderFileClient {
  list(options?: {
    readonly folder?: string;
    readonly pageSize?: number;
    readonly signal?: AbortSignal;
  }): AsyncIterable<CollectionFileDescriptor>;
  download(file: CollectionFileDescriptor, options?: DocumentOpenOptions): Promise<Blob>;
}

export interface ObjectUrlFactory {
  create(blob: Blob): string;
  revoke(url: string): void;
}

const browserObjectUrls: ObjectUrlFactory = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
};

export class ConnectDocumentError extends Error {
  public constructor(operation: string, code: string) {
    super(`mdbase Connect could not ${operation}: ${code}`);
    this.name = "ConnectDocumentError";
  }
}

export class ConnectDocumentRepository implements DocumentRepository {
  readonly #descriptorsById = new Map<string, CollectionFileDescriptor>();
  readonly #descriptorsByPath = new Map<string, CollectionFileDescriptor>();
  readonly #documents = new Map<string, CachedDocument>();
  #accessSequence = 0;

  public constructor(
    private readonly files: ReaderFileClient,
    private readonly objectUrls: ObjectUrlFactory = browserObjectUrls,
    private readonly maxCachedDocuments = 6,
  ) {}

  public async open(
    _collectionId: CollectionId,
    target: DocumentTarget,
    options: DocumentOpenOptions = {},
  ): Promise<DocumentHandle> {
    const descriptor = await this.#find(target, options);
    if (!descriptor) {
      throw new ConnectDocumentError("open document", "file_not_found");
    }
    if (descriptor.contentDigest !== target.revision) {
      throw new ConnectDocumentError("open document", "file_revision_changed");
    }
    const cached = await this.#load(descriptor, options);
    cached.leases += 1;
    cached.lastAccess = ++this.#accessSequence;
    this.#trimCache();
    let closed = false;
    return {
      fileId: toFileId(descriptor.fileId),
      revision: toFileRevision(descriptor.contentDigest),
      mediaType: cached.mediaType,
      url: cached.url,
      close: () => {
        if (!closed) {
          cached.leases -= 1;
          closed = true;
          this.#trimCache();
        }
        return Promise.resolve();
      },
    };
  }

  public dispose(): void {
    for (const document of this.#documents.values()) {
      this.objectUrls.revoke(document.url);
    }
    this.#documents.clear();
  }

  async #load(
    descriptor: CollectionFileDescriptor,
    options: DocumentOpenOptions,
  ): Promise<CachedDocument> {
    const key = documentCacheKey(descriptor);
    const cached = this.#documents.get(key);
    if (cached) {
      return cached;
    }
    const blob = options.signal
      ? await this.files.download(descriptor, options)
      : await this.files.download(descriptor);
    const loadedElsewhere = this.#documents.get(key);
    if (loadedElsewhere) {
      return loadedElsewhere;
    }
    const document = {
      url: this.objectUrls.create(blob),
      mediaType: descriptor.mediaType ?? (blob.type || mediaTypeFromPath(descriptor.path)),
      leases: 0,
      lastAccess: ++this.#accessSequence,
    } satisfies CachedDocument;
    this.#documents.set(key, document);
    return document;
  }

  #trimCache(): void {
    if (this.#documents.size <= this.maxCachedDocuments) {
      return;
    }
    const removable = [...this.#documents.entries()]
      .filter(([, document]) => document.leases === 0)
      .sort((left, right) => left[1].lastAccess - right[1].lastAccess);
    for (const [key, document] of removable) {
      if (this.#documents.size <= this.maxCachedDocuments) {
        break;
      }
      this.objectUrls.revoke(document.url);
      this.#documents.delete(key);
    }
  }

  async #find(
    target: DocumentTarget,
    options: DocumentOpenOptions,
  ): Promise<CollectionFileDescriptor | null> {
    const cached = this.#descriptorsById.get(target.fileId);
    if (cached) {
      return cached;
    }
    const path = portableFilePath(target.file);
    const cachedByPath = this.#descriptorsByPath.get(path);
    if (cachedByPath?.contentDigest === target.revision) {
      return cachedByPath;
    }
    const folder = parentFolder(path);
    for await (const descriptor of this.files.list({
      ...(folder ? { folder } : {}),
      pageSize: 100,
      ...options,
    })) {
      this.#descriptorsById.set(descriptor.fileId, descriptor);
      this.#descriptorsByPath.set(descriptor.path, descriptor);
    }
    return (
      this.#descriptorsById.get(target.fileId) ??
      exactRevision(this.#descriptorsByPath.get(path), target.revision)
    );
  }
}

interface CachedDocument {
  readonly url: string;
  readonly mediaType: string;
  leases: number;
  lastAccess: number;
}

function documentCacheKey(descriptor: CollectionFileDescriptor): string {
  return `${descriptor.fileId}:${descriptor.contentDigest}`;
}

function exactRevision(
  descriptor: CollectionFileDescriptor | undefined,
  revision: string,
): CollectionFileDescriptor | null {
  return descriptor?.contentDigest === revision ? descriptor : null;
}

function portableFilePath(link: string): string {
  const wikilink = /^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/u.exec(link.trim());
  return wikilink?.[1] ?? link.trim();
}

function parentFolder(path: string): string | undefined {
  const separator = path.lastIndexOf("/");
  return separator > 0 ? path.slice(0, separator) : undefined;
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
  return "application/octet-stream";
}

export function connectDocumentRepository(connection: MdbaseConnection): ConnectDocumentRepository {
  return new ConnectDocumentRepository(connection.files);
}

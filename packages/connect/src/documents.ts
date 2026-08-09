import {
  fileId as toFileId,
  fileRevision as toFileRevision,
  type CollectionId,
  type DocumentHandle,
  type DocumentRepository,
  type DocumentTarget,
} from "@mdbase-reader/core";

import type { CollectionFileDescriptor, MdbaseConnection } from "@mdbase-dev/connect";

export interface ReaderFileClient {
  list(options?: {
    readonly folder?: string;
    readonly pageSize?: number;
  }): AsyncIterable<CollectionFileDescriptor>;
  download(file: CollectionFileDescriptor): Promise<Blob>;
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

  public constructor(
    private readonly files: ReaderFileClient,
    private readonly objectUrls: ObjectUrlFactory = browserObjectUrls,
  ) {}

  public async open(_collectionId: CollectionId, target: DocumentTarget): Promise<DocumentHandle> {
    const descriptor = await this.#find(target);
    if (!descriptor) {
      throw new ConnectDocumentError("open document", "file_not_found");
    }
    if (descriptor.contentDigest !== target.revision) {
      throw new ConnectDocumentError("open document", "file_revision_changed");
    }
    const blob = await this.files.download(descriptor);
    const url = this.objectUrls.create(blob);
    let closed = false;
    return {
      fileId: toFileId(descriptor.fileId),
      revision: toFileRevision(descriptor.contentDigest),
      mediaType: descriptor.mediaType ?? (blob.type || mediaTypeFromPath(descriptor.path)),
      url,
      close: () => {
        if (!closed) {
          this.objectUrls.revoke(url);
          closed = true;
        }
        return Promise.resolve();
      },
    };
  }

  async #find(target: DocumentTarget): Promise<CollectionFileDescriptor | null> {
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
      pageSize: 1_000,
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

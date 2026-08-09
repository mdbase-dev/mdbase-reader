import {
  fileId as toFileId,
  fileRevision as toFileRevision,
  type CollectionId,
  type DocumentHandle,
  type DocumentRepository,
  type FileId,
  type FileRevision,
} from "@mdbase-reader/core";

import type { CollectionFileDescriptor, MdbaseConnection } from "@mdbase-dev/connect";

export interface ReaderFileClient {
  list(): AsyncIterable<CollectionFileDescriptor>;
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
  public constructor(
    private readonly files: ReaderFileClient,
    private readonly objectUrls: ObjectUrlFactory = browserObjectUrls,
  ) {}

  public async open(
    _collectionId: CollectionId,
    requestedFileId: FileId,
    requestedRevision: FileRevision,
  ): Promise<DocumentHandle> {
    const descriptor = await this.#find(requestedFileId);
    if (!descriptor) {
      throw new ConnectDocumentError("open document", "file_not_found");
    }
    if (descriptor.contentDigest !== requestedRevision) {
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

  async #find(requestedFileId: FileId): Promise<CollectionFileDescriptor | null> {
    for await (const descriptor of this.files.list()) {
      if (descriptor.fileId === requestedFileId) {
        return descriptor;
      }
    }
    return null;
  }
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

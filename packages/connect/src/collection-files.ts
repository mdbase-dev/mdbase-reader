import { ConnectDocumentError, type ReaderFileClient } from "./documents.js";

import type { CollectionFileDescriptor, MdbaseConnection } from "@mdbase-dev/connect";
import type {
  CollectionFileRepository,
  CollectionId,
  ExportedCollectionFile,
  FileRevision,
  ReaderRequestOptions,
} from "@mdbase-reader/core";

export class ConnectCollectionFileRepository implements CollectionFileRepository {
  readonly #descriptorsByPath = new Map<string, CollectionFileDescriptor>();
  readonly #loadedFolders = new Set<string>();

  constructor(private readonly files: ReaderFileClient) {}

  async read(
    _collectionId: CollectionId,
    file: string,
    expectedRevision?: FileRevision,
    options: ReaderRequestOptions = {},
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

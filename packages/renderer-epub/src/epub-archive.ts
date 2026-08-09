import { BlobReader, BlobWriter, TextWriter, ZipReader, type FileEntry } from "@zip.js/zip.js";

import { safeEpubPath } from "./epub-path.js";

const MAX_ENTRIES = 5_000;
const MAX_ENTRY_BYTES = 128 * 1024 * 1024;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 1_000;
const RATIO_CHECK_THRESHOLD = 1024 * 1024;

export interface EpubArchiveEntry {
  readonly path: string;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
}

export class EpubArchive {
  readonly entries: readonly EpubArchiveEntry[];
  readonly #reader: ZipReader<Blob>;
  readonly #files: ReadonlyMap<string, FileEntry>;
  #closed = false;

  private constructor(reader: ZipReader<Blob>, files: ReadonlyMap<string, FileEntry>) {
    this.#reader = reader;
    this.#files = files;
    this.entries = [...files].map(([path, entry]) => ({
      path,
      compressedSize: entry.compressedSize,
      uncompressedSize: entry.uncompressedSize,
    }));
  }

  static async open(blob: Blob): Promise<EpubArchive> {
    const reader = new ZipReader(new BlobReader(blob), {
      useWebWorkers: true,
      checkOverlappingEntry: true,
    });
    try {
      const entries = await reader.getEntries();
      if (entries.length > MAX_ENTRIES) {
        throw new Error(`EPUB archive exceeds the ${String(MAX_ENTRIES)}-entry safety limit.`);
      }
      const files = new Map<string, FileEntry>();
      let totalBytes = 0;
      for (const entry of entries) {
        if (entry.directory) {
          continue;
        }
        const path = safeEpubPath(entry.filename);
        validateEntry(entry, path);
        if (files.has(path)) {
          throw new Error(`EPUB archive contains a duplicate path: ${path}`);
        }
        totalBytes += entry.uncompressedSize;
        if (totalBytes > MAX_TOTAL_BYTES) {
          throw new Error("EPUB archive exceeds the uncompressed size safety limit.");
        }
        files.set(path, entry);
      }
      if (!files.has("META-INF/container.xml")) {
        throw new Error("EPUB archive is missing META-INF/container.xml.");
      }
      return new EpubArchive(reader, files);
    } catch (reason) {
      await reader.close();
      throw reason;
    }
  }

  async readText(path: string): Promise<string> {
    return this.#entry(path).getData(new TextWriter());
  }

  async readBlob(path: string, mediaType?: string): Promise<Blob> {
    return this.#entry(path).getData(new BlobWriter(mediaType));
  }

  async close(): Promise<void> {
    if (!this.#closed) {
      this.#closed = true;
      await this.#reader.close();
    }
  }

  #entry(path: string): FileEntry {
    if (this.#closed) {
      throw new Error("EPUB archive is closed.");
    }
    const safePath = safeEpubPath(path);
    const entry = this.#files.get(safePath);
    if (!entry) {
      throw new Error(`EPUB resource is missing: ${safePath}`);
    }
    return entry;
  }
}

function validateEntry(entry: FileEntry, path: string): void {
  if (entry.encrypted) {
    throw new Error(`Encrypted EPUB resources are not supported: ${path}`);
  }
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
    throw new Error(`EPUB resource exceeds the per-file safety limit: ${path}`);
  }
  if (
    entry.uncompressedSize >= RATIO_CHECK_THRESHOLD &&
    entry.uncompressedSize / Math.max(entry.compressedSize, 1) > MAX_COMPRESSION_RATIO
  ) {
    throw new Error(`EPUB resource has an unsafe compression ratio: ${path}`);
  }
}

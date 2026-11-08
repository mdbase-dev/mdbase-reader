import type {
  CollectionFileDescriptor,
  FileListOptions,
  FileUploadOptions,
} from "./connect-types.js";
import type { PlannedSourceRepresentation } from "@mdbase-reader/core";

export interface ReaderSourceFileListOptions extends FileListOptions {
  readonly contentDigests?: readonly string[];
}

export interface ReaderSourceFileClient {
  list?(options?: ReaderSourceFileListOptions): AsyncIterable<CollectionFileDescriptor>;
  upload(
    path: string,
    source: Blob,
    options?: FileUploadOptions,
  ): Promise<CollectionFileDescriptor>;
}

/** Uploads one planned file under its transfer identity; the file client resumes that transfer. */
export function uploadRepresentation(
  files: ReaderSourceFileClient,
  representation: PlannedSourceRepresentation,
  options: Omit<FileUploadOptions, "mediaType" | "transferId">,
): Promise<CollectionFileDescriptor> {
  return files.upload(
    representation.filePath,
    new Blob([representation.bytes.slice().buffer], { type: representation.mediaType }),
    { ...options, mediaType: representation.mediaType, transferId: representation.transferId },
  );
}

/** One `documents` entry for an uploaded representation. */
export function documentEntry(
  representation: PlannedSourceRepresentation,
  descriptor: CollectionFileDescriptor,
  extra: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    file_id: descriptor.fileId,
    file: `[[${descriptor.path}]]`,
    role: representation.role,
    format: representation.format,
    media_type: representation.mediaType,
    revision: descriptor.contentDigest,
    label: representation.originalName,
    ...extra,
  };
}

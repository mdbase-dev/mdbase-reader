import {
  MdbaseConnectError,
  type CollectionFileDescriptor,
  type MdbaseFileListOptions,
  type MdbaseFileUploadOptions,
} from "@mdbase-dev/connect";

import type { PlannedSourceRepresentation } from "@mdbase-reader/core";

export interface ReaderSourceFileClient {
  list?(options?: MdbaseFileListOptions): AsyncIterable<CollectionFileDescriptor>;
  upload(
    path: string,
    source: Blob,
    options?: MdbaseFileUploadOptions,
  ): Promise<CollectionFileDescriptor>;
}

/** Uploads one planned file, resuming the same transfer if its first outcome is unknown. */
export async function uploadWithRecovery(
  files: ReaderSourceFileClient,
  representation: PlannedSourceRepresentation,
  options: Omit<MdbaseFileUploadOptions, "mediaType" | "transferId">,
): Promise<CollectionFileDescriptor> {
  const upload = (): Promise<CollectionFileDescriptor> =>
    files.upload(
      representation.filePath,
      new Blob([representation.bytes.slice().buffer], { type: representation.mediaType }),
      {
        ...options,
        mediaType: representation.mediaType,
        transferId: representation.transferId,
      },
    );
  try {
    return await upload();
  } catch (error) {
    if (!(error instanceof MdbaseConnectError) || !error.outcomeUnknown) {
      throw error;
    }
    // File control has its own durable transfer journal rather than the
    // connection's generic pending-mutation store. Reopening the exact same
    // transfer with a fresh SDK deadline resumes it or replays its receipt.
    return upload();
  }
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

// mdbase-next backend: Reader's file seams over the new SDK's FilesApi.
import { connectSuccess } from "@mdbase-dev/connect/advanced";
import { isMdbaseError, uuidv7, type FileView, type MdbaseClient } from "@mdbase-dev/sdk";

import { asMdbaseError, nextOutcome, nextRepositoryError } from "./errors.js";

import type { ReaderAssetClient } from "../annotation-assets.js";
import type { ReaderFileClient } from "../documents.js";
import type { ReaderSourceFileClient } from "../source-files.js";
import type {
  CollectionFileDescriptor,
  ConnectOutcome,
  ConnectRequestOptions,
  MdbaseFileListOptions,
  MdbaseFileUploadOptions,
} from "@mdbase-dev/connect";

type StatTarget = Parameters<ReaderFileClient["stat"]>[0];

const mediaTypes: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
  html: "text/html",
  htm: "text/html",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

function mediaTypeOf(path: string): string | undefined {
  return mediaTypes[path.split(".").at(-1)?.toLowerCase() ?? ""];
}

/**
 * A replica file view as a Connect file descriptor. The replica's revision is the
 * content digest; file views carry no modification time.
 */
export function fileDescriptor(file: FileView): CollectionFileDescriptor {
  const mediaType = mediaTypeOf(file.path);
  return {
    fileId: file.id,
    path: file.path,
    revision: file.digest,
    contentDigest: file.digest as CollectionFileDescriptor["contentDigest"],
    size: file.size,
    ...(mediaType ? { mediaType } : {}),
    mediaClass: file.media,
    modifiedAt: "",
  };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Transfers are identified by UUID. Reader's stable retry keys are kept stable by
 * deriving a UUID (version 8) from their SHA-256, so a retry resumes the same transfer.
 */
export async function transferUuid(key: string): Promise<string> {
  if (uuidPattern.test(key)) {
    return key.toLowerCase();
  }
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)),
  ).slice(0, 16);
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x80;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type NextReaderFiles = ReaderFileClient & ReaderSourceFileClient & ReaderAssetClient;

/** Reader's stat, list, upload and download over replica files. */
export function nextReaderFiles(db: MdbaseClient): NextReaderFiles {
  return {
    stat: (target: StatTarget, options?: ConnectRequestOptions) => stat(db, target, options),
    list: (options?: MdbaseFileListOptions) => list(db, options),
    upload: (path: string, source: Blob, options?: MdbaseFileUploadOptions) =>
      upload(db, path, source, options).catch((error: unknown) => {
        throw nextRepositoryError("upload a file", error);
      }),
    download: async (file: CollectionFileDescriptor, options?: { signal?: AbortSignal }) => {
      const bytes = await db.files
        .download(file.fileId, { ...(options?.signal ? { signal: options.signal } : {}) })
        .catch((error: unknown) => {
          throw nextRepositoryError("download a file", error);
        });
      return new Blob([bytes.slice().buffer], {
        type: file.mediaType ?? mediaTypeOf(file.path) ?? "application/octet-stream",
      });
    },
  };
}

async function stat(
  db: MdbaseClient,
  target: StatTarget,
  options?: ConnectRequestOptions,
): Promise<ConnectOutcome<CollectionFileDescriptor | null>> {
  try {
    const file = await db.files.get(
      target.path === undefined ? target.fileId : { path: target.path },
      options?.signal,
    );
    return connectSuccess(fileDescriptor(file));
  } catch (error) {
    if (isMdbaseError(error, "not_found") || isMdbaseError(error, "invalid_request")) {
      // An unknown or malformed file ID is simply not a file here.
      return connectSuccess(null);
    }
    return nextOutcome(() => Promise.reject(asMdbaseError(error)));
  }
}

async function* list(
  db: MdbaseClient,
  options: MdbaseFileListOptions = {},
): AsyncGenerator<CollectionFileDescriptor> {
  for await (const file of db.files.list({
    ...(options.folder ? { folder: options.folder } : {}),
    ...(options.pageSize ? { pageSize: options.pageSize } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  })) {
    yield fileDescriptor(file);
  }
}

/**
 * Uploads and returns the file as it now reads locally (pending until confirmed).
 * A replace (`ifRevision`) targets the file currently at `path`.
 */
async function upload(
  db: MdbaseClient,
  path: string,
  source: Blob,
  options: MdbaseFileUploadOptions = {},
): Promise<CollectionFileDescriptor> {
  const key = options.transferId ?? uuidv7();
  const transferId = await transferUuid(key);
  const existing = options.ifRevision
    ? await db.files.get({ path }, options.signal).catch(() => null)
    : null;
  const write = await db.files.upload(path, source, {
    transferId,
    // The same retry key resubmits the same mutation, so a retried commit is idempotent.
    mutationId: await transferUuid(`${key}:commit`),
    ...(existing ? { fileId: existing.id } : {}),
    ...(options.ifRevision ? { ifRevision: options.ifRevision } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.onProgress
      ? {
          onProgress: (progress) =>
            options.onProgress?.({
              phase: "uploading",
              transferredBytes: progress.done,
              totalBytes: progress.total,
            }),
        }
      : {}),
  });
  if (write.state === "rejected" || write.state === "unknown") {
    await write.confirmed;
  }
  return fileDescriptor(await db.files.get({ path }, options.signal));
}

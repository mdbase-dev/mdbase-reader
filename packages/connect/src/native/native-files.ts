import { connectFailure, connectSuccess } from "@mdbase-dev/connect/advanced";
import { isMdbaseError, MdbaseError, uuidv7 } from "@mdbase-dev/sdk";

import { connectProblemFor } from "./native-mapping.js";

import type { ReaderAssetClient } from "../annotation-assets.js";
import type { ReaderFileClient } from "../documents.js";
import type { ReaderSourceFileClient } from "../source-files.js";
import type {
  CollectionFileDescriptor,
  ConnectOutcome,
  ConnectRequestOptions,
  MdbaseFileListOptions,
  MdbaseFileStatTarget,
  MdbaseFileUploadOptions,
} from "@mdbase-dev/connect";
import type { FilesApi, FileView } from "@mdbase-dev/sdk";

export type NativeReaderFileClient = ReaderFileClient &
  ReaderAssetClient &
  Required<ReaderSourceFileClient>;

/**
 * Reader's file seams over one borrowed public SDK `FilesApi`. Every await is
 * fenced by `isCurrent`. Uploads keep one transfer and mutation identity, so a
 * retried transfer resumes or replays instead of writing a second file.
 */
export function nativeReaderFiles(
  files: FilesApi,
  isCurrent: () => boolean = () => true,
): NativeReaderFileClient {
  const check = (signal?: AbortSignal): void => {
    if (!isCurrent()) {
      throw new MdbaseError({
        code: "cancelled",
        recovery: "none",
        message: "This collection is no longer open in mdbase Reader.",
      });
    }
    signal?.throwIfAborted();
  };

  async function stat(
    target: MdbaseFileStatTarget,
    options: ConnectRequestOptions = {},
  ): Promise<ConnectOutcome<CollectionFileDescriptor | null>> {
    try {
      check(options.signal);
      const view = await files.get(
        target.path === undefined ? target.fileId : { path: target.path },
        options.signal,
      );
      check(options.signal);
      return connectSuccess(descriptor(view));
    } catch (error) {
      return isMdbaseError(error, "not_found")
        ? connectSuccess(null)
        : connectFailure(connectProblemFor(error));
    }
  }

  async function upload(
    path: string,
    source: Blob,
    options: MdbaseFileUploadOptions = {},
  ): Promise<CollectionFileDescriptor> {
    check(options.signal);
    const grant = files.grant;
    if (grant && !grant.actions.includes("add")) {
      throw new MdbaseError({
        code: "forbidden",
        recovery: "reauthorize",
        message: "This collection does not allow mdbase Reader to add files.",
      });
    }
    const transferId = options.transferId ?? uuidv7();
    const mutationId = uuidv7();
    const once = async (): Promise<CollectionFileDescriptor> => {
      const write = await files.upload(path, source, {
        transferId,
        mutationId,
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.ifRevision ? { ifRevision: options.ifRevision } : {}),
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
      check(options.signal);
      await write.confirmed;
      check(options.signal);
      const view = await files.get(write.fileId, options.signal);
      check(options.signal);
      return descriptor(view, options.mediaType);
    };
    try {
      return await once();
    } catch (error) {
      check(options.signal);
      // Resume the same transfer and mutation once after an unsettled outcome.
      if (isMdbaseError(error, "outcome_unknown") || isMdbaseError(error, "unavailable")) {
        return once();
      }
      throw error;
    }
  }

  return {
    stat,
    async download(file, options = {}) {
      check(options.signal);
      const view = await files.get(file.fileId, options.signal);
      check(options.signal);
      if (view.digest !== file.contentDigest) {
        throw new MdbaseError({
          code: "conflict",
          reason: "file_revision_changed",
          recovery: "refresh",
          message: "This file changed. Reload it before opening.",
        });
      }
      const bytes = await files.download(view, options.signal ? { signal: options.signal } : {});
      check(options.signal);
      return new Blob([bytes as BlobPart], file.mediaType ? { type: file.mediaType } : {});
    },
    upload,
    async *list(options: MdbaseFileListOptions = {}) {
      check(options.signal);
      for await (const view of files.list({
        ...(options.folder ? { folder: options.folder } : {}),
        ...(options.pageSize ? { pageSize: options.pageSize } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      })) {
        check(options.signal);
        yield descriptor(view);
      }
    },
  };
}

/** Native files carry a media class but no media type; Reader derives it from the path. */
function descriptor(view: FileView, mediaType?: string): CollectionFileDescriptor {
  if (!view.digest.startsWith("sha256:")) {
    throw new Error("The collection returned a file without its content digest.");
  }
  return {
    fileId: view.id,
    path: view.path,
    revision: view.digest,
    contentDigest: view.digest as `sha256:${string}`,
    size: view.size,
    mediaClass: view.media,
    ...(mediaType ? { mediaType } : {}),
    // Consumers treat an empty time as unknown; no time is invented.
    modifiedAt: view.mtime === undefined ? "" : new Date(view.mtime).toISOString(),
  };
}

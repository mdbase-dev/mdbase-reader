import { isMdbaseError, MdbaseError, uuidv7 } from "@mdbase-dev/sdk";

import { connectFailure, connectSuccess } from "../connect-types.js";

import { connectProblemFor } from "./native-mapping.js";

import type { ReaderAssetClient } from "../annotation-assets.js";
import type {
  CollectionFileDescriptor,
  ConnectOutcome,
  FileStatTarget,
  FileUploadOptions,
} from "../connect-types.js";
import type { ReaderFileClient } from "../documents.js";
import type { ReaderSourceFileClient, ReaderSourceFileListOptions } from "../source-files.js";
import type { MdbaseClient, FileView } from "@mdbase-dev/sdk";

export type NativeReaderFileClient = ReaderFileClient &
  ReaderAssetClient &
  Required<ReaderSourceFileClient>;

/**
 * Reader's file seams over one borrowed public SDK `FilesApi`. Every await is
 * fenced by `isCurrent`. Uploads keep one transfer and mutation identity, so a
 * retried transfer resumes or replays instead of writing a second file.
 */
export function nativeReaderFiles(
  client: Pick<MdbaseClient, "files" | "awaitReceipt" | "ledger">,
  isCurrent: () => boolean = () => true,
): NativeReaderFileClient {
  const { files } = client;
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
    target: FileStatTarget,
    options: { readonly signal?: AbortSignal } = {},
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
    options: FileUploadOptions = {},
  ): Promise<CollectionFileDescriptor> {
    check(options.signal);
    requireFileAddGrant(files.grant);
    const transferId = options.transferId ?? uuidv7();
    const mutationId = uuidv7();
    const once = (): ReturnType<MdbaseClient["files"]["upload"]> =>
      files.upload(path, source, {
        transferId,
        mutationId,
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.onProgress
          ? {
              onProgress: (progress) =>
                options.onProgress?.({
                  transferredBytes: progress.done,
                  totalBytes: progress.total,
                }),
            }
          : {}),
      });
    let write;
    try {
      write = await once();
    } catch (error) {
      check(options.signal);
      // Resume the same transfer and mutation once after an unsettled outcome.
      if (isMdbaseError(error, "outcome_unknown") || isMdbaseError(error, "unavailable")) {
        write = await once();
      } else {
        throw error;
      }
    }
    check(options.signal);
    const receipt = await client.awaitReceipt(write.mutationId, 30_000, options.signal);
    check(options.signal);
    requireConfirmedUpload(receipt, path);
    const view = await files.get(write.fileId, options.signal);
    check(options.signal);
    return descriptor(view);
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
    async *list(options: ReaderSourceFileListOptions = {}) {
      check(options.signal);
      for await (const view of files.list({
        ...(options.folder ? { folder: options.folder } : {}),
        ...(options.pageSize ? { pageSize: options.pageSize } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      })) {
        check(options.signal);
        if (options.contentDigests && !options.contentDigests.includes(view.digest)) {
          continue;
        }
        if (client.ledger.stateOf(view.id) !== "saved") {
          throw new MdbaseError({
            code: "outcome_unknown",
            recovery: "refresh",
            message: `“${view.path}” is still waiting for confirmation. Check pending changes before adding it again.`,
          });
        }
        yield descriptor(view);
      }
    },
  };
}

function requireFileAddGrant(grant: MdbaseClient["files"]["grant"]): void {
  if (grant && !grant.actions.includes("add")) {
    throw new MdbaseError({
      code: "forbidden",
      recovery: "reauthorize",
      message: "This collection does not allow mdbase Reader to add files.",
    });
  }
}

function requireConfirmedUpload(
  receipt: Awaited<ReturnType<MdbaseClient["awaitReceipt"]>>,
  path: string,
): void {
  if (receipt.state === "rejected") {
    throw new MdbaseError(
      receipt.problem ?? {
        code: "conflict",
        recovery: "resolve_conflict",
        message: "The collection refused this file. Review the change before trying again.",
      },
    );
  }
  if (receipt.state !== "confirmed") {
    throw new MdbaseError({
      code: "outcome_unknown",
      recovery: "refresh",
      message: `The collection has not confirmed “${path}”. No source was created. Check pending changes before adding it again.`,
    });
  }
}

/** The media type is the replica's, derived from the file extension; absent when unknown. */
function descriptor(view: FileView): CollectionFileDescriptor {
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
    ...(view.mediaType ? { mediaType: view.mediaType } : {}),
    // Consumers treat an empty time as unknown; no time is invented.
    modifiedAt: view.mtime === undefined ? "" : new Date(view.mtime).toISOString(),
  };
}

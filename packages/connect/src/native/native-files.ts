import { isMdbaseError, MdbaseError, uuidv7 } from "@mdbase-dev/sdk";

import type { ReaderSourceFileListOptions } from "../source-files.js";
import type { FileRef, FileView, MdbaseClient, ReadOptions, UploadOptions } from "@mdbase-dev/sdk";

export interface NativeReaderFileClient {
  get(ref: FileRef, options?: ReadOptions): Promise<FileView>;
  download(file: FileView, options?: ReadOptions): Promise<Blob>;
  upload(path: string, source: Blob, options?: UploadOptions): Promise<FileView>;
  list(options?: ReaderSourceFileListOptions): AsyncIterable<FileView>;
}

/** The borrowed file client keeps Reader's scope and confirmed-upload requirement. */
export function nativeReaderFiles(
  client: Pick<MdbaseClient, "files" | "settle" | "ledger">,
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
  return {
    async get(ref, options = {}) {
      check(options.signal);
      const file = await files.get(ref, options);
      check(options.signal);
      return file;
    },
    async download(file, options = {}) {
      check(options.signal);
      const current = await files.get(file.id, options);
      check(options.signal);
      if (current.digest !== file.digest) {
        throw new MdbaseError({
          code: "conflict",
          reason: "file_revision_changed",
          recovery: "refresh",
          message: "This file changed. Reload it before opening.",
        });
      }
      const bytes = await files.download(current, options.signal ? { signal: options.signal } : {});
      check(options.signal);
      return new Blob([bytes as BlobPart], current.mediaType ? { type: current.mediaType } : {});
    },
    async upload(path, source, options = {}) {
      check(options.signal);
      if (files.grant && !files.grant.actions.includes("add")) {
        throw new MdbaseError({
          code: "forbidden",
          recovery: "reauthorize",
          message: "This collection does not allow mdbase Reader to add files.",
        });
      }
      const transferId = options.transferId ?? uuidv7();
      const mutationId = options.mutationId ?? uuidv7();
      // The SDK owns reconnect/resumption. Settle the original write, never upload again.
      const write = await files.upload(path, source, { ...options, transferId, mutationId });
      const settled = await client.settle(write, {
        timeoutMs: 30_000,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      check(options.signal);
      if (settled.outcome === "rejected") {
        throw new MdbaseError(settled.problem, { mutationId });
      }
      if (settled.outcome !== "confirmed") {
        throw new MdbaseError(
          {
            code: "outcome_unknown",
            recovery: "resolve_outcome",
            message: `The collection has not confirmed “${path}”. No source was created. Check pending changes before adding it again.`,
          },
          { mutationId },
        );
      }
      const file = await files.get(write.fileId, options);
      check(options.signal);
      return file;
    },
    async *list(options = {}) {
      const { contentDigests, ...read } = options;
      check(options.signal);
      for await (const file of files.list(read)) {
        check(options.signal);
        if (contentDigests && !contentDigests.includes(file.digest)) {
          continue;
        }
        if (client.ledger.stateOf(file.id) !== "saved") {
          throw new MdbaseError({
            code: "outcome_unknown",
            recovery: "refresh",
            message: `“${file.path}” is still waiting for confirmation. Check pending changes before adding it again.`,
          });
        }
        yield file;
      }
    },
  };
}

export async function findFile(
  files: Pick<NativeReaderFileClient, "get">,
  ref: FileRef,
  options: ReadOptions = {},
): Promise<FileView | null> {
  try {
    return await files.get(ref, options);
  } catch (error) {
    if (isMdbaseError(error, "not_found")) {
      return null;
    }
    throw error;
  }
}

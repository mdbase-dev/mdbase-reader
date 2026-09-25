import {
  recordRevision,
  type PlannedSourceAttachment,
  type Source,
  type SourceImportOptions,
} from "@mdbase-reader/core";

import { sourceFromDocument } from "./mapping.js";
import { ConnectRepositoryError, outcomeValue } from "./repository-client.js";
import { documentEntry, uploadWithRecovery, type ReaderSourceFileClient } from "./source-files.js";

import type { ReaderConnectClient } from "./repository-client.js";

/**
 * Uploads a file, then appends it to the source's `documents` at the revision just read, so a
 * concurrent edit to the record fails rather than being overwritten.
 */
export async function attachRepresentation(
  records: ReaderConnectClient,
  files: ReaderSourceFileClient,
  plan: PlannedSourceAttachment,
  options: SourceImportOptions = {},
): Promise<Source> {
  const { representation } = plan;
  const totalBytes = representation.bytes.byteLength;
  const descriptor = await uploadWithRecovery(files, representation, {
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.onProgress
      ? {
          onProgress: (progress) => {
            if (progress.phase === "uploading") {
              options.onProgress?.({
                phase: "uploading",
                completedBytes: progress.transferredBytes,
                totalBytes,
                fileIndex: 1,
                fileCount: 1,
              });
            }
          },
        }
      : {}),
  });
  if (descriptor.contentDigest !== representation.contentDigest) {
    throw new ConnectRepositoryError(
      "verify attached file",
      "content_digest_mismatch",
      "The stored file did not match the selected bytes.",
    );
  }
  options.onProgress?.({
    phase: "creating",
    completedBytes: totalBytes,
    totalBytes,
    fileIndex: 1,
    fileCount: 1,
  });
  const current = outcomeValue(
    await records.read({ path: plan.recordPath, includeDocument: true }),
    "read source before attaching a file",
  );
  if (current.frontmatter["id"] !== plan.sourceId) {
    throw new ConnectRepositoryError(
      "attach file",
      "source_moved",
      "The source changed location before the file could be attached.",
    );
  }
  const existing = Array.isArray(current.frontmatter["documents"])
    ? (current.frontmatter["documents"] as readonly unknown[])
    : [];
  const entry = documentEntry(representation, descriptor, {
    ...(plan.originUrl ? { origin_url: plan.originUrl } : {}),
    ...(plan.originUrl ? { retrieved_at: plan.retrievedAt } : {}),
  });
  const updated = outcomeValue(
    await records.update({
      path: plan.recordPath,
      ifRevision: recordRevision(current.revision),
      patch: { documents: [...existing, entry] },
      includeDocument: true,
    }),
    "attach file to source",
  );
  return sourceFromDocument(plan.collectionId, updated);
}

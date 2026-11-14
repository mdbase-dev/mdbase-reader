import {
  recordRevision,
  type PlannedSourceAttachment,
  type Source,
  type SourceImportOptions,
} from "@mdbase-reader/core";

import { sourceFromDocument } from "./mapping.js";
import { frontmatterChanges, updateRecord, ConnectRepositoryError } from "./repository-client.js";
import { documentEntry, type ReaderSourceFileClient } from "./source-files.js";

import type { MdbaseClient } from "@mdbase-dev/sdk";

/**
 * Uploads a file, then appends it to the source's `documents` at the revision just read, so a
 * concurrent edit to the record fails rather than being overwritten.
 */
export async function attachRepresentation(
  records: MdbaseClient,
  files: ReaderSourceFileClient,
  plan: PlannedSourceAttachment,
  options: SourceImportOptions = {},
): Promise<Source> {
  const { representation } = plan;
  const totalBytes = representation.bytes.byteLength;
  const descriptor = await files.upload(
    representation.filePath,
    new Blob([representation.bytes.slice().buffer], { type: representation.mediaType }),
    {
      transferId: representation.transferId,
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.onProgress
        ? {
            onProgress: (progress) => {
              {
                options.onProgress?.({
                  phase: "uploading",
                  completedBytes: progress.done,
                  totalBytes,
                  fileIndex: 1,
                  fileCount: 1,
                });
              }
            },
          }
        : {}),
    },
  );
  if (descriptor.digest !== representation.contentDigest) {
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
  const current = await records.get(
    { path: plan.recordPath },
    { include: { effective: true, body: true, document: true } },
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
  const updated = await updateRecord(
    records,
    { path: plan.recordPath },
    {
      ifRevision: recordRevision(current.revision),
      ...frontmatterChanges({ documents: [...existing, entry] }),
    },
  );
  return sourceFromDocument(plan.collectionId, updated);
}

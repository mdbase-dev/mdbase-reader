import {
  MdbaseConnectError,
  type CollectionFileDescriptor,
  type ConnectOutcome,
  type MdbaseFileListOptions,
  type MdbaseConnection,
  type MdbaseFileUploadOptions,
  type RecordDocument,
} from "@mdbase-dev/connect";

import { sourceContract } from "./contracts.js";
import { sourceFromDocument, sourceSummaryFromQuery } from "./mapping.js";
import { ConnectRepositoryError, outcomeValue } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type {
  CollectionId,
  PlannedSourceFileImport,
  PlannedSourceRepresentation,
  ReaderRequestOptions,
  Source,
  SourceImportOptions,
  SourceImportRepository,
  SourceSummary,
} from "@mdbase-reader/core";

export interface ReaderSourceFileClient {
  list?(options?: MdbaseFileListOptions): AsyncIterable<CollectionFileDescriptor>;
  upload(
    path: string,
    source: Blob,
    options?: MdbaseFileUploadOptions,
  ): Promise<CollectionFileDescriptor>;
}

export class ConnectSourceImportRepository implements SourceImportRepository {
  public constructor(
    private readonly records: ReaderConnectClient,
    private readonly files: ReaderSourceFileClient,
  ) {}

  public async findExactDuplicate(
    collectionId: CollectionId,
    contentDigests: readonly `sha256:${string}`[],
    options: ReaderRequestOptions = {},
  ): Promise<SourceSummary | null> {
    const expected = new Set<string>(contentDigests);
    for await (const outcome of this.records.queryPages(
      { contract: sourceContract, frontmatterMode: "effective" },
      { ...options, firstPageSize: 500, pageSize: 1_000 },
    )) {
      const page = outcomeValue(outcome, "check imported file duplicates");
      for (const record of page.results) {
        const source = sourceSummaryFromQuery(collectionId, record);
        if (source.documents.some(({ revision }) => expected.has(revision))) {
          return source;
        }
      }
    }
    return null;
  }

  public async commitFile(
    plan: PlannedSourceFileImport,
    options: SourceImportOptions = {},
  ): Promise<Source> {
    const descriptors = new Map<PlannedSourceRepresentation["role"], CollectionFileDescriptor>();
    const uploadRank: Readonly<Record<PlannedSourceRepresentation["role"], number>> = {
      archive: 0,
      primary: 1,
    };
    const orderedUploads = [...plan.representations].sort(
      (left, right) => uploadRank[left.role] - uploadRank[right.role],
    );
    const recoverableFiles = options.recoverExistingFiles
      ? await this.recoverableFiles(options)
      : new Map<string, CollectionFileDescriptor[]>();
    const totalBytes = plan.representations.reduce((sum, item) => sum + item.bytes.byteLength, 0);
    let completedBytes = 0;
    for (const [index, representation] of orderedUploads.entries()) {
      options.signal?.throwIfAborted();
      const recovered = takeMatchingFile(recoverableFiles, representation.contentDigest);
      const descriptor =
        recovered ??
        (await this.uploadWithRecovery(representation, {
          ...(options.signal ? { signal: options.signal } : {}),
          ...(options.onProgress
            ? {
                onProgress: (progress) => {
                  if (progress.phase === "uploading") {
                    options.onProgress?.({
                      phase: "uploading",
                      completedBytes: completedBytes + progress.transferredBytes,
                      totalBytes,
                      fileIndex: index + 1,
                      fileCount: orderedUploads.length,
                    });
                  }
                },
              }
            : {}),
        }));
      if (descriptor.contentDigest !== representation.contentDigest) {
        throw new ConnectRepositoryError(
          "verify imported file",
          "content_digest_mismatch",
          "The stored file did not match the selected bytes.",
        );
      }
      descriptors.set(representation.role, descriptor);
      completedBytes += representation.bytes.byteLength;
      options.onProgress?.({
        phase: "uploading",
        completedBytes,
        totalBytes,
        fileIndex: index + 1,
        fileCount: orderedUploads.length,
      });
    }
    options.signal?.throwIfAborted();
    options.onProgress?.({
      phase: "creating",
      completedBytes: totalBytes,
      totalBytes,
      fileIndex: orderedUploads.length,
      fileCount: orderedUploads.length,
    });

    const created = await this.records.create({
      path: plan.recordPath,
      type: "reader-source",
      frontmatter: sourceFrontmatter(plan, descriptors),
      body: plan.body ?? `# ${plan.title}\n`,
      includeDocument: true,
    });
    const document = created.ok ? created.value : await this.recoverCreatedSource(plan, created);
    return sourceFromDocument(plan.collectionId, document);
  }

  private async uploadWithRecovery(
    representation: PlannedSourceRepresentation,
    options: Omit<MdbaseFileUploadOptions, "mediaType" | "transferId">,
  ): Promise<CollectionFileDescriptor> {
    const upload = (): Promise<CollectionFileDescriptor> =>
      this.files.upload(
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

  private async recoverableFiles(
    options: SourceImportOptions,
  ): Promise<Map<string, CollectionFileDescriptor[]>> {
    const byDigest = new Map<string, CollectionFileDescriptor[]>();
    if (!this.files.list) {
      return byDigest;
    }
    for await (const file of this.files.list({
      folder: "files/reader",
      pageSize: 500,
      ...(options.signal ? { signal: options.signal } : {}),
    })) {
      const matches = byDigest.get(file.contentDigest) ?? [];
      matches.push(file);
      byDigest.set(file.contentDigest, matches);
    }
    return byDigest;
  }

  private async recoverCreatedSource(
    plan: PlannedSourceFileImport,
    failure: Exclude<ConnectOutcome<RecordDocument>, { readonly ok: true }>,
  ): Promise<RecordDocument> {
    const recovered = await this.records.read({
      path: plan.recordPath,
      contract: sourceContract,
      includeDocument: true,
    });
    if (recovered.ok && recovered.value.effectiveFrontmatter["id"] === plan.sourceId) {
      return recovered.value;
    }
    return outcomeValue(failure, "create imported source");
  }
}

function takeMatchingFile(
  files: Map<string, CollectionFileDescriptor[]>,
  digest: string,
): CollectionFileDescriptor | undefined {
  return files.get(digest)?.shift();
}

function sourceFrontmatter(
  plan: PlannedSourceFileImport,
  descriptors: ReadonlyMap<PlannedSourceRepresentation["role"], CollectionFileDescriptor>,
): Readonly<Record<string, unknown>> {
  const capture = plan.capture;
  const metadata = plan.metadata;
  return {
    id: plan.sourceId,
    title: plan.title,
    kind: plan.kind,
    saved_at: plan.savedAt,
    ...(plan.tags ? { tags: plan.tags } : {}),
    ...(metadata?.authors?.length ? { authors: metadata.authors } : {}),
    ...(metadata?.published ? { published: metadata.published } : {}),
    ...(metadata?.description ? { description: metadata.description } : {}),
    ...(metadata?.language ? { language: metadata.language } : {}),
    ...(metadata?.site ? { site: metadata.site } : {}),
    ...(capture
      ? {
          url: capture.canonicalUrl,
          ...(capture.submittedUrl !== capture.canonicalUrl
            ? { original_url: capture.submittedUrl }
            : {}),
          capture: {
            method: "url",
            application: "dev.mdbase.reader",
            captured_at: capture.retrievedAt,
            submitted_url: capture.submittedUrl,
            canonical_url: capture.canonicalUrl,
          },
        }
      : {}),
    documents: plan.representations.map((representation) => {
      const descriptor = descriptors.get(representation.role);
      if (!descriptor) {
        throw new ConnectRepositoryError(
          "create imported source",
          "missing_file_descriptor",
          `The ${representation.role} representation was not committed.`,
        );
      }
      const derivedFrom = representation.derivedFromRole
        ? descriptors.get(representation.derivedFromRole)
        : undefined;
      return {
        file_id: descriptor.fileId,
        file: `[[${descriptor.path}]]`,
        role: representation.role,
        format: representation.format,
        media_type: representation.mediaType,
        revision: descriptor.contentDigest,
        label: representation.originalName,
        ...(derivedFrom ? { derived_from_file_id: derivedFrom.fileId } : {}),
        ...(capture && representation.role === "archive"
          ? { origin_url: capture.canonicalUrl, retrieved_at: capture.retrievedAt }
          : {}),
      };
    }),
    reading: { status: "inbox" },
  };
}

export function connectSourceImportRepository(
  connection: MdbaseConnection,
  records: ReaderConnectClient,
): ConnectSourceImportRepository {
  return new ConnectSourceImportRepository(records, connection.files);
}

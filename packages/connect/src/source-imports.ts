import { sourceContract } from "./contracts.js";
import { sourceFromDocument, sourceSummaryFromQuery } from "./mapping.js";
import { ConnectRepositoryError, outcomeValue } from "./repository-client.js";
import { attachRepresentation } from "./source-attachments.js";
import { uploadWithRecovery, type ReaderSourceFileClient } from "./source-files.js";
import { sourceFrontmatter } from "./source-frontmatter.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type {
  CollectionFileDescriptor,
  ConnectOutcome,
  MdbaseConnection,
  RecordDocument,
} from "@mdbase-dev/connect";
import type {
  CollectionId,
  PlannedSourceAttachment,
  PlannedSourceFileImport,
  PlannedSourceRepresentation,
  ReaderRequestOptions,
  Source,
  SourceImportOptions,
  SourceImportRepository,
  SourceSummary,
} from "@mdbase-reader/core";

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
      alternative: 2,
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
        (await uploadWithRecovery(this.files, representation, {
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

  public attachFile(
    plan: PlannedSourceAttachment,
    options: SourceImportOptions = {},
  ): Promise<Source> {
    return attachRepresentation(this.records, this.files, plan, options);
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

export function connectSourceImportRepository(
  connection: MdbaseConnection,
  records: ReaderConnectClient,
): ConnectSourceImportRepository {
  return new ConnectSourceImportRepository(records, connection.files);
}

export type { ReaderSourceFileClient } from "./source-files.js";

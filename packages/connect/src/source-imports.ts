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
    if (!expected.size) {
      return null;
    }
    const matches = [...expected]
      .map((digest) => `value.revision == ${JSON.stringify(digest)}`)
      .join(" || ");
    for await (const outcome of this.records.queryPages(
      {
        types: ["reader-source"],
        where: `documents != null && documents.filter(${matches}).length > 0`,
        frontmatterMode: "effective",
      },
      { ...options, firstPageSize: 50, pageSize: 50 },
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
      ? await this.recoverableFiles(options, plan)
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

    return sourceFromDocument(plan.collectionId, await this.createRecord(plan, descriptors));
  }

  public attachFile(
    plan: PlannedSourceAttachment,
    options: SourceImportOptions = {},
  ): Promise<Source> {
    return attachRepresentation(this.records, this.files, plan, options);
  }

  private async recoverableFiles(
    options: SourceImportOptions,
    plan: PlannedSourceFileImport,
  ): Promise<Map<string, CollectionFileDescriptor[]>> {
    const byDigest = new Map<string, CollectionFileDescriptor[]>();
    if (!this.files.list) {
      return byDigest;
    }
    options.onProgress?.({
      phase: "recovering",
      completedBytes: 0,
      totalBytes: plan.representations.reduce((sum, item) => sum + item.bytes.byteLength, 0),
      fileIndex: 0,
      fileCount: plan.representations.length,
    });
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

  /** Creates the source note at its readable path, or at the fallback when that path is taken. */
  private async createRecord(
    plan: PlannedSourceFileImport,
    descriptors: ReadonlyMap<PlannedSourceRepresentation["role"], CollectionFileDescriptor>,
  ): Promise<RecordDocument> {
    const paths = [plan.recordPath, plan.fallbackRecordPath ?? plan.recordPath];
    for (const [index, path] of paths.entries()) {
      const created = await this.records.create({
        path,
        type: "reader-source",
        frontmatter: sourceFrontmatter(plan, descriptors),
        body: plan.body ?? `# ${plan.title}\n`,
        includeDocument: true,
      });
      const document = created.ok
        ? created.value
        : await this.recoverCreatedSource(plan, path, created, index === paths.length - 1);
      if (document) {
        return document;
      }
    }
    throw new Error("A source record could not be created.");
  }

  /**
   * After a failed create: the record a retried import already wrote, or null when another record
   * holds the path and the next path should be tried. Any other failure is thrown.
   */
  private async recoverCreatedSource(
    plan: PlannedSourceFileImport,
    path: string,
    failure: Exclude<ConnectOutcome<RecordDocument>, { readonly ok: true }>,
    lastPath: boolean,
  ): Promise<RecordDocument | null> {
    const existing = await this.records.read({
      path,
      contract: sourceContract,
      includeDocument: true,
    });
    if (existing.ok && existing.value.effectiveFrontmatter["id"] === plan.sourceId) {
      return existing.value;
    }
    // Something else holds the path, or the source contract cannot read what does.
    return lastPath ? outcomeValue(failure, "create imported source") : null;
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

import { sourceContract } from "./contracts.js";
import { CreateFollowThrough } from "./create-follow-through.js";
import { createSourcePart } from "./create-source-part.js";
import { sourceFromDocument, sourceSummaryFromQuery } from "./mapping.js";
import { ConnectRepositoryError, outcomeValue } from "./repository-client.js";
import { attachRepresentation } from "./source-attachments.js";
import { uploadWithRecovery, type ReaderSourceFileClient } from "./source-files.js";
import { sourceFrontmatter } from "./source-frontmatter.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type {
  CollectionFileDescriptor,
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
  readonly #creates: CreateFollowThrough;

  public constructor(
    private readonly records: ReaderConnectClient,
    private readonly files: ReaderSourceFileClient,
    /** Keeps each create until the collection confirms it; one per client by default. */
    creates?: CreateFollowThrough,
  ) {
    this.#creates = creates ?? new CreateFollowThrough(records);
  }

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
      .map((digest) => `document.revision == ${JSON.stringify(digest)}`)
      .join(" || ");
    for await (const outcome of this.records.queryPages(
      {
        types: ["reader-source"],
        where: `documents != null && documents.exists(document, ${matches})`,
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

  public createPart(
    plan: Parameters<NonNullable<SourceImportRepository["createPart"]>>[0],
    options: ReaderRequestOptions = {},
  ): Promise<Source> {
    return createSourcePart(this.records, plan, options, this.#creates);
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

  /**
   * Creates the source note at its readable path, or at the fallback when that path is taken.
   * The files are uploaded first and are confirmed by then (`native-files.ts` waits for
   * `write.confirmed`), so only the record can still be refused later; the follow-through
   * keeps it until the collection confirms it.
   */
  private async createRecord(
    plan: PlannedSourceFileImport,
    descriptors: ReadonlyMap<PlannedSourceRepresentation["role"], CollectionFileDescriptor>,
  ): Promise<RecordDocument> {
    return outcomeValue(
      await this.#creates.create({
        key: plan.sourceId,
        collectionId: plan.collectionId,
        kind: "source",
        recordId: plan.sourceId,
        label: plan.title,
        candidates: [plan.recordPath, plan.fallbackRecordPath ?? plan.recordPath],
        input: {
          type: "reader-source",
          frontmatter: sourceFrontmatter(plan, descriptors),
          body: plan.body ?? `# ${plan.title}\n`,
        },
        // A retried import wrote the record already when the source contract reads our ID.
        readBack: { contract: sourceContract, includeDocument: true },
        isOurs: (document) => document.effectiveFrontmatter["id"] === plan.sourceId,
      }),
      "create imported source",
    );
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

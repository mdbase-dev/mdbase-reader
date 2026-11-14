import { authorYearFromMetadata } from "@mdbase-reader/core";

import { sourceContract } from "./contracts.js";
import { CreateFollowThrough } from "./create-follow-through.js";
import { createSourcePart } from "./create-source-part.js";
import { sourceFromDocument, sourceSummaryFromQuery } from "./mapping.js";
import {
  currentNameTemplates,
  sourceNotePathCandidates,
  type ReaderNaming,
} from "./naming-templates.js";
import { completeReaderPages, ConnectRepositoryError } from "./repository-client.js";
import { attachRepresentation } from "./source-attachments.js";
import { sourceFrontmatter } from "./source-frontmatter.js";

import type { ReaderSourceFileClient } from "./source-files.js";
import type { MdbaseClient, FileView, RecordView } from "@mdbase-dev/sdk";
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
  readonly #naming: ReaderNaming | undefined;

  public constructor(
    private readonly records: MdbaseClient,
    private readonly files: ReaderSourceFileClient,
    /** Keeps each create until the collection confirms it; one per client by default. */
    creates?: CreateFollowThrough,
    /** The collection's name templates; Reader's default names without one. */
    naming?: ReaderNaming,
  ) {
    this.#creates = creates ?? new CreateFollowThrough(records);
    this.#naming = naming;
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
    for await (const outcome of completeReaderPages(
      this.records,
      {
        types: ["reader-source"],
        where: `documents != null && documents.exists(document, ${matches})`,
      },
      { ...options },
    )) {
      const page = outcome;
      for (const record of page.records) {
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
    return createSourcePart(this.records, plan, options, this.#creates, this.#naming);
  }

  public async commitFile(
    plan: PlannedSourceFileImport,
    options: SourceImportOptions = {},
  ): Promise<Source> {
    const descriptors = new Map<PlannedSourceRepresentation["role"], FileView>();
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
      : new Map<string, FileView[]>();
    const totalBytes = plan.representations.reduce((sum, item) => sum + item.bytes.byteLength, 0);
    let completedBytes = 0;
    for (const [index, representation] of orderedUploads.entries()) {
      options.signal?.throwIfAborted();
      const recovered = takeMatchingFile(recoverableFiles, representation.contentDigest);
      const descriptor =
        recovered ??
        (await this.files.upload(
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
                        completedBytes: completedBytes + progress.done,
                        totalBytes,
                        fileIndex: index + 1,
                        fileCount: orderedUploads.length,
                      });
                    }
                  },
                }
              : {}),
          },
        ));
      if (descriptor.digest !== representation.contentDigest) {
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
  ): Promise<Map<string, FileView[]>> {
    const byDigest = new Map<string, FileView[]>();
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

      contentDigests: plan.representations.map(({ contentDigest }) => contentDigest),
      ...(options.signal ? { signal: options.signal } : {}),
    })) {
      const matches = byDigest.get(file.digest) ?? [];
      matches.push(file);
      byDigest.set(file.digest, matches);
    }
    return byDigest;
  }

  /**
   * Creates the source note at the first of its candidate paths that no other record has.
   * The files are uploaded first and are confirmed by then (`native-files.ts` waits for
   * its receipt), so only the record can still be refused later; the follow-through
   * keeps it until the collection confirms it.
   */
  private async createRecord(
    plan: PlannedSourceFileImport,
    descriptors: ReadonlyMap<PlannedSourceRepresentation["role"], FileView>,
  ): Promise<RecordView> {
    const templates = await currentNameTemplates(this.#naming);
    const candidates = await sourceNotePathCandidates(
      templates.source,
      {
        id: plan.sourceId,
        title: plan.title,
        creators: plan.metadata?.authors ?? [],
        authorYear: authorYearFromMetadata(plan.metadata),
        kind: plan.kind,
        published: plan.metadata?.published,
        site: plan.metadata?.site,
        savedAt: plan.savedAt,
      },
      undefined,
      plan.recordPathCandidates,
    );
    return await this.#creates.create({
      key: plan.sourceId,
      collectionId: plan.collectionId,
      kind: "source",
      recordId: plan.sourceId,
      label: plan.title,
      candidates,
      input: {
        type: "reader-source",
        frontmatter: sourceFrontmatter(plan, descriptors),
        body: plan.body ?? `# ${plan.title}\n`,
      },
      // A retried import wrote the record already when the source contract reads our ID.
      readBack: { contract: sourceContract },
      isOurs: (document) => (document.effective ?? document.frontmatter)["id"] === plan.sourceId,
    });
  }
}

function takeMatchingFile(files: Map<string, FileView[]>, digest: string): FileView | undefined {
  return files.get(digest)?.shift();
}

export type { ReaderSourceFileClient } from "./source-files.js";

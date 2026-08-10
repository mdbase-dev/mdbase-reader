import type { Annotation, AnnotationDeletionPlan, AnnotationDraft } from "../domain/annotation.js";
import type { CslItem } from "../domain/citation.js";
import type { DocumentTarget } from "../domain/document.js";
import type {
  AnnotationId,
  CollectionId,
  FileId,
  MutationId,
  RecordRevision,
  SourceId,
} from "../domain/identity.js";
import type { FileRevision } from "../domain/revision.js";
import type { SourceTextSearchMatch } from "../domain/search.js";
import type {
  Page,
  ReadingPosition,
  Source,
  SourceQuery,
  SourceSummary,
} from "../domain/source.js";
import type { DateTime } from "../domain/time.js";

export interface SourceRepository {
  list(query: SourceQuery, options?: ReaderRequestOptions): Promise<Page<SourceSummary>>;
  get(
    collectionId: CollectionId,
    id: SourceId,
    options?: ReaderRequestOptions,
  ): Promise<Source | null>;
  updateBody(input: {
    readonly collectionId: CollectionId;
    readonly sourceId: SourceId;
    readonly expectedRevision: RecordRevision;
    readonly body: string;
  }): Promise<Source>;
  updateReading(input: {
    readonly collectionId: CollectionId;
    readonly sourceId: SourceId;
    readonly expectedRevision: RecordRevision;
    readonly documentFileId: FileId;
    readonly position: ReadingPosition;
    readonly openedAt: DateTime;
  }): Promise<Source>;
  updateCitation(input: {
    readonly collectionId: CollectionId;
    readonly sourceId: SourceId;
    readonly expectedRevision: RecordRevision;
    readonly citation: CslItem;
  }): Promise<Source>;
  appendAnnotationEmbed(input: {
    readonly collectionId: CollectionId;
    readonly sourceId: SourceId;
    readonly expectedRevision: RecordRevision;
    readonly annotationId: AnnotationId;
    readonly embed: string;
    readonly idempotencyKey: MutationId;
  }): Promise<RecordRevision>;
}

export interface ContentSearchRepository {
  search(
    collectionId: CollectionId,
    query: string,
    options?: ReaderRequestOptions,
  ): Promise<readonly SourceTextSearchMatch[]>;
}

export interface AnnotationRepository {
  sourceIdsWithAnnotations?(
    collectionId: CollectionId,
    options?: ReaderRequestOptions,
  ): Promise<readonly SourceId[]>;
  listForSource(
    collectionId: CollectionId,
    sourceId: SourceId,
    options?: ReaderRequestOptions,
  ): Promise<readonly Annotation[]>;
  create(annotation: Annotation, idempotencyKey: MutationId): Promise<Annotation>;
  updateBody(input: {
    readonly annotation: Annotation;
    readonly body: string;
    readonly modifiedAt: DateTime;
  }): Promise<Annotation>;
  preflightDelete(annotation: Annotation): Promise<AnnotationDeletionPlan>;
  delete(annotation: Annotation, plan: AnnotationDeletionPlan): Promise<void>;
  get(
    collectionId: CollectionId,
    id: AnnotationId,
    options?: ReaderRequestOptions,
  ): Promise<Annotation | null>;
}

export interface DocumentHandle {
  readonly fileId: FileId;
  readonly revision: FileRevision;
  readonly mediaType: string;
  readonly url: string;
  close(): Promise<void>;
}

export interface ReaderRequestOptions {
  readonly signal?: AbortSignal;
}

export type DocumentOpenOptions = ReaderRequestOptions;

export interface DocumentRepository {
  open(
    collectionId: CollectionId,
    target: DocumentTarget,
    options?: DocumentOpenOptions,
  ): Promise<DocumentHandle>;
}

export interface ExportedCollectionFile {
  readonly path: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface CollectionFileRepository {
  read(
    collectionId: CollectionId,
    file: string,
    expectedRevision?: FileRevision,
    options?: ReaderRequestOptions,
  ): Promise<ExportedCollectionFile>;
}

export type MutationStage =
  "planned" | "asset-stored" | "annotation-created" | "source-transcluded" | "complete" | "failed";

export interface AnnotationAssetRepository {
  store(input: {
    readonly collectionId: CollectionId;
    readonly path: string;
    readonly bytes: Uint8Array;
    readonly mediaType: "image/png";
    readonly idempotencyKey: MutationId;
  }): Promise<void>;
}

export interface MutationJournal {
  start(input: {
    readonly id: MutationId;
    readonly operation: "create-annotation";
    readonly collectionId: CollectionId;
    readonly sourceId: SourceId;
    readonly annotationId: AnnotationId;
    readonly assetPath?: string;
  }): Promise<void>;
  mark(id: MutationId, stage: MutationStage, problem?: string): Promise<void>;
}

export interface Clock {
  now(): DateTime;
}

export interface ReaderIdGenerator {
  source(): SourceId;
  annotation(): AnnotationId;
  mutation(): MutationId;
}

export interface ContentHasher {
  sha256(bytes: Uint8Array): Promise<`sha256:${string}`>;
}

export interface SourceImportRepository {
  findExactDuplicate(
    collectionId: CollectionId,
    contentDigests: readonly `sha256:${string}`[],
    options?: ReaderRequestOptions,
  ): Promise<SourceSummary | null>;
  commitFile(plan: PlannedSourceFileImport, options?: SourceImportOptions): Promise<Source>;
}

export type SourceDocumentFormat = "pdf" | "epub" | "html";

export interface SourceFileImportRequest {
  readonly collectionId: CollectionId;
  readonly name: string;
  readonly declaredMediaType?: string;
  readonly bytes: Uint8Array;
  readonly title?: string;
  readonly capture?: SourceCaptureProvenance;
  readonly archive?: SourceCaptureArchive;
  readonly metadata?: SourceImportMetadata;
}

export interface SourceCaptureProvenance {
  readonly submittedUrl: string;
  readonly canonicalUrl: string;
  readonly retrievedAt: DateTime;
}

export interface SourceCaptureArchive {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface SourceImportMetadata {
  readonly authors?: readonly string[];
  readonly published?: string;
  readonly description?: string;
  readonly language?: string;
  readonly site?: string;
}

export interface SourceImportProgress {
  readonly phase: "checking" | "uploading" | "creating";
  readonly completedBytes: number;
  readonly totalBytes: number;
  readonly fileIndex: number;
  readonly fileCount: number;
}

export interface SourceImportOptions extends ReaderRequestOptions {
  readonly onProgress?: (progress: SourceImportProgress) => void;
  /**
   * Search for exact uploaded bytes left by an earlier failed attempt before
   * starting a new transfer. Ordinary first attempts keep this disabled so a
   * large collection does not pay an orphan-recovery scan on every import.
   */
  readonly recoverExistingFiles?: boolean;
}

export interface PlannedSourceRepresentation {
  readonly transferId: MutationId;
  readonly role: "primary" | "archive";
  readonly format: SourceDocumentFormat;
  readonly mediaType: string;
  readonly contentDigest: `sha256:${string}`;
  readonly originalName: string;
  readonly filePath: string;
  readonly bytes: Uint8Array;
  readonly derivedFromRole?: "archive";
}

export interface PlannedSourceFileImport {
  readonly collectionId: CollectionId;
  readonly sourceId: SourceId;
  readonly title: string;
  readonly kind: "document" | "webpage";
  readonly savedAt: DateTime;
  readonly recordPath: string;
  readonly representations: readonly PlannedSourceRepresentation[];
  readonly capture?: SourceCaptureProvenance;
  readonly metadata?: SourceImportMetadata;
}

export interface AnnotationCreationRequest extends AnnotationDraft {
  readonly attachment?: {
    readonly bytes: Uint8Array;
    readonly mediaType: "image/png";
  };
  readonly transclude?: {
    readonly path: string;
  };
}

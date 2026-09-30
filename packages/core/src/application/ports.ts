import type { SourceLookups } from "./source-lookups.js";
import type { Annotation, AnnotationDeletionPlan, AnnotationDraft } from "../domain/annotation.js";
import type { CitationCandidate, CitationResolutionRequest } from "../domain/citation-metadata.js";
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
  ReadingStatus,
  Source,
  SourceFieldChange,
  SourceQuery,
  SourceSummary,
} from "../domain/source.js";
import type { DateTime } from "../domain/time.js";

export type * from "./source-import-ports.js";

export interface RecoverBodyInput {
  readonly collectionId: CollectionId;
  /** The request ID of the interrupted write, from its Connect problem. */
  readonly requestId: string;
}

/** Exact continuation of body updates whose outcome is unknown. Never a new write. */
export interface BodyUpdateRecovery {
  recoverSource(input: RecoverBodyInput): Promise<Source>;
  recoverAnnotation(input: RecoverBodyInput): Promise<Annotation>;
  /** Whether the interrupted write is still durably pending. */
  pending(requestId: string): boolean;
}

export interface SourceRepository extends SourceLookups {
  list(query: SourceQuery, options?: ReaderRequestOptions): Promise<Page<SourceSummary>>;
  /** Stream one stable query when the backing store supports pinned pagination. */
  listPages?(
    query: Omit<SourceQuery, "cursor">,
    options?: ReaderRequestOptions,
  ): AsyncIterable<Page<SourceSummary>>;
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
    /** The persisted frontmatter at `expectedRevision`, which lets the write skip a fresh read. */
    readonly expectedFrontmatter?: Source["frontmatter"];
    readonly documentFileId: FileId;
    readonly position: ReadingPosition;
    readonly openedAt: DateTime;
  }): Promise<Source>;
  updateReadingStatus?(input: {
    readonly collectionId: CollectionId;
    readonly sourceId: SourceId;
    readonly status: ReadingStatus;
    readonly changedAt: DateTime;
  }): Promise<Source>;
  /** Sets frontmatter fields by dotted path; a null value removes the field. */
  updateFields?(input: SourceFieldChange): Promise<Source>;
  /** Replaces only `csl`, so it needs no revision: no other field is at risk. */
  updateCitation(input: {
    readonly collectionId: CollectionId;
    readonly sourceId: SourceId;
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

export interface CitationMetadataRepository {
  resolve(
    request: CitationResolutionRequest,
    options?: ReaderRequestOptions,
  ): Promise<CitationCandidate>;
}

/** A read across a whole collection. */
type CollectionRead<T> = (collectionId: CollectionId, options?: ReaderRequestOptions) => Promise<T>;

export interface AnnotationRepository {
  /** Evict a record after a write recovered outside this repository. */
  invalidateRecord?(path: string): void;
  sourceIdsWithAnnotations?: CollectionRead<readonly SourceId[]>;
  /** How many annotations each source has, where an index makes that cheap. */
  annotationCountsBySource?: CollectionRead<ReadonlyMap<SourceId, number>>;
  /** Every annotation in the collection. */
  listAll?: (
    collectionId: CollectionId,
    options?: AnnotationListOptions,
  ) => Promise<readonly Annotation[]>;
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

/** A scoped annotation read. Progress snapshots are cumulative and may be incomplete. */
export interface AnnotationListOptions extends ReaderRequestOptions {
  readonly paths?: ReadonlySet<string>;
  readonly onProgress?: (annotations: readonly Annotation[]) => void;
  /** Bypass short-lived record caches, e.g. for an explicit retry. */
  readonly refresh?: boolean;
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
  /** Newer work in this family may replace an older, still-pending read. */
  readonly replaceableFamily?: string;
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

export interface AnnotationCreationRequest extends AnnotationDraft {
  readonly sourceRecord: Source;
  readonly attachment?: {
    readonly bytes: Uint8Array;
    readonly mediaType: "image/png";
  };
  readonly transclude?: {
    readonly path: string;
  };
}

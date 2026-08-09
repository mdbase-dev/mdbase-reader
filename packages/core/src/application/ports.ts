import type { Annotation, AnnotationDraft } from "../domain/annotation.js";
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
import type { Page, Source, SourceQuery, SourceSummary } from "../domain/source.js";
import type { DateTime } from "../domain/time.js";

export interface SourceRepository {
  list(query: SourceQuery): Promise<Page<SourceSummary>>;
  get(collectionId: CollectionId, id: SourceId): Promise<Source | null>;
  updateBody(input: {
    readonly collectionId: CollectionId;
    readonly sourceId: SourceId;
    readonly expectedRevision: RecordRevision;
    readonly body: string;
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

export interface AnnotationRepository {
  listForSource(collectionId: CollectionId, sourceId: SourceId): Promise<readonly Annotation[]>;
  create(annotation: Annotation, idempotencyKey: MutationId): Promise<Annotation>;
  get(collectionId: CollectionId, id: AnnotationId): Promise<Annotation | null>;
}

export interface DocumentHandle {
  readonly fileId: FileId;
  readonly revision: FileRevision;
  readonly mediaType: string;
  readonly url: string;
  close(): Promise<void>;
}

export interface DocumentRepository {
  open(collectionId: CollectionId, target: DocumentTarget): Promise<DocumentHandle>;
}

export type MutationStage =
  "planned" | "annotation-created" | "source-transcluded" | "complete" | "failed";

export interface MutationJournal {
  start(input: {
    readonly id: MutationId;
    readonly operation: "create-annotation";
    readonly collectionId: CollectionId;
    readonly sourceId: SourceId;
    readonly annotationId: AnnotationId;
  }): Promise<void>;
  mark(id: MutationId, stage: MutationStage, problem?: string): Promise<void>;
}

export interface Clock {
  now(): DateTime;
}

export interface ReaderIdGenerator {
  annotation(): AnnotationId;
  mutation(): MutationId;
}

export interface AnnotationCreationRequest extends AnnotationDraft {
  readonly transclude?: {
    readonly path: string;
  };
}

import { annotationEmbed, validateAnnotationDraft, type Annotation } from "../domain/annotation.js";
import { DomainError } from "../domain/errors.js";

import type {
  AnnotationCreationRequest,
  AnnotationRepository,
  Clock,
  MutationJournal,
  ReaderIdGenerator,
  SourceRepository,
} from "./ports.js";

export interface CreateAnnotationDependencies {
  readonly annotations: AnnotationRepository;
  readonly clock: Clock;
  readonly ids: ReaderIdGenerator;
  readonly journal: MutationJournal;
  readonly sources: SourceRepository;
}

export interface CreateAnnotationResult {
  readonly annotation: Annotation;
  readonly transcluded: boolean;
}

function assertCurrentDocument(
  request: AnnotationCreationRequest,
  source: Awaited<ReturnType<SourceRepository["get"]>>,
): void {
  if (!request.document || !source) {
    return;
  }
  const current = source.documents.find((document) => document.fileId === request.document?.fileId);
  if (!current) {
    throw new DomainError(
      "document-not-found",
      "The selected document does not belong to this source.",
    );
  }
  if (current.revision !== request.document.revision) {
    throw new DomainError(
      "document-revision-mismatch",
      "The selected document changed before the annotation was saved.",
    );
  }
}

export async function createAnnotation(
  dependencies: CreateAnnotationDependencies,
  request: AnnotationCreationRequest,
): Promise<CreateAnnotationResult> {
  validateAnnotationDraft(request);
  const source = await dependencies.sources.get(request.collectionId, request.sourceId);
  if (!source) {
    throw new DomainError("source-not-found", "The annotation source no longer exists.");
  }
  assertCurrentDocument(request, source);

  const annotationId = dependencies.ids.annotation();
  const mutationId = dependencies.ids.mutation();
  const annotation: Annotation = {
    ...request,
    id: annotationId,
    createdAt: dependencies.clock.now(),
    createdBy: "dev.mdbase.reader",
  };

  await dependencies.journal.start({
    id: mutationId,
    operation: "create-annotation",
    collectionId: request.collectionId,
    sourceId: request.sourceId,
    annotationId,
  });

  try {
    const created = await dependencies.annotations.create(annotation, mutationId);
    await dependencies.journal.mark(mutationId, "annotation-created");
    if (request.transclude) {
      await dependencies.sources.appendAnnotationEmbed({
        collectionId: request.collectionId,
        sourceId: request.sourceId,
        expectedRevision: source.recordRevision,
        annotationId,
        embed: annotationEmbed(request.transclude.path),
        idempotencyKey: mutationId,
      });
      await dependencies.journal.mark(mutationId, "source-transcluded");
    }
    await dependencies.journal.mark(mutationId, "complete");
    return { annotation: created, transcluded: Boolean(request.transclude) };
  } catch (error) {
    const problem = error instanceof Error ? error.message : "Unknown annotation creation failure";
    await dependencies.journal.mark(mutationId, "failed", problem);
    throw error;
  }
}

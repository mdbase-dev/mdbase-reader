import { annotationEmbed, validateAnnotationDraft, type Annotation } from "../domain/annotation.js";
import { DomainError } from "../domain/errors.js";

import type {
  AnnotationCreationRequest,
  AnnotationAssetRepository,
  AnnotationRepository,
  Clock,
  MutationJournal,
  ReaderIdGenerator,
  SourceRepository,
} from "./ports.js";

export interface CreateAnnotationDependencies {
  readonly annotations: AnnotationRepository;
  readonly assets?: AnnotationAssetRepository;
  readonly clock: Clock;
  readonly ids: ReaderIdGenerator;
  readonly journal: MutationJournal;
  readonly sources: SourceRepository;
  /** Optional, content-free timing hook for diagnosing slow saves. */
  readonly onTiming?: (
    stage: "journal-start" | "asset-upload" | "annotation-create" | "journal-mark",
    milliseconds: number,
  ) => void;
}

async function timed<T>(
  dependencies: CreateAnnotationDependencies,
  stage: "journal-start" | "asset-upload" | "annotation-create" | "journal-mark",
  operation: () => Promise<T>,
): Promise<T> {
  if (!dependencies.onTiming) {
    return operation();
  }
  const start = performance.now();
  try {
    return await operation();
  } finally {
    dependencies.onTiming(stage, performance.now() - start);
  }
}

export interface CreateAnnotationResult {
  readonly annotation: Annotation;
  readonly assetStored: boolean;
  readonly transcluded: boolean;
}

function assetPath(annotationId: Annotation["id"]): string {
  return `files/annotation-${annotationId}.png`;
}

function bodyWithAsset(body: string, path: string): string {
  const embed = annotationEmbed(path);
  const note = body.trim();
  return note ? `${embed}\n\n${note}` : embed;
}

function annotationFromRequest(
  request: AnnotationCreationRequest,
  id: Annotation["id"],
  createdAt: Annotation["createdAt"],
  attachmentPath?: string,
): Annotation {
  return {
    collectionId: request.collectionId,
    sourceId: request.sourceId,
    source: request.source,
    ...(request.document ? { document: request.document } : {}),
    annotationType: request.annotationType,
    ...(request.motivation ? { motivation: request.motivation } : {}),
    ...(request.color ? { color: request.color } : {}),
    ...(request.locator ? { locator: request.locator } : {}),
    ...(request.target ? { target: request.target } : {}),
    tags: request.tags,
    body: attachmentPath ? bodyWithAsset(request.body, attachmentPath) : request.body,
    id,
    createdAt,
    createdBy: "dev.mdbase.reader",
  };
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
  // The source note can still name an older digest after its file changes.
  // Keep the version actually read in the annotation without blocking its save.
}

export async function createAnnotation(
  dependencies: CreateAnnotationDependencies,
  request: AnnotationCreationRequest,
): Promise<CreateAnnotationResult> {
  validateAnnotationDraft(request);
  const source = request.sourceRecord;
  if (source.collectionId !== request.collectionId || source.id !== request.sourceId) {
    throw new DomainError("source-not-found", "The loaded annotation source no longer matches.");
  }
  assertCurrentDocument(request, source);

  const annotationId = dependencies.ids.annotation();
  const mutationId = dependencies.ids.mutation();
  const attachmentPath = request.attachment ? assetPath(annotationId) : undefined;
  const { attachment, transclude } = request;
  const annotation = annotationFromRequest(
    request,
    annotationId,
    dependencies.clock.now(),
    attachmentPath,
  );

  await timed(dependencies, "journal-start", () =>
    dependencies.journal.start({
      id: mutationId,
      operation: "create-annotation",
      collectionId: request.collectionId,
      sourceId: request.sourceId,
      annotationId,
      ...(attachmentPath ? { assetPath: attachmentPath } : {}),
    }),
  );

  try {
    if (attachment && attachmentPath) {
      const assets = dependencies.assets;
      if (!assets) {
        throw new DomainError(
          "annotation-assets-unavailable",
          "This Reader connection cannot store annotation images.",
        );
      }
      await timed(dependencies, "asset-upload", () =>
        assets.store({
          collectionId: request.collectionId,
          path: attachmentPath,
          bytes: attachment.bytes,
          mediaType: attachment.mediaType,
          idempotencyKey: mutationId,
        }),
      );
      await timed(dependencies, "journal-mark", () =>
        dependencies.journal.mark(mutationId, "asset-stored"),
      );
    }
    const created = await timed(dependencies, "annotation-create", () =>
      dependencies.annotations.create(annotation, mutationId),
    );
    await timed(dependencies, "journal-mark", () =>
      dependencies.journal.mark(mutationId, "annotation-created"),
    );
    if (transclude) {
      await dependencies.sources.appendAnnotationEmbed({
        collectionId: request.collectionId,
        sourceId: request.sourceId,
        expectedRevision: source.recordRevision,
        annotationId,
        embed: annotationEmbed(transclude.path),
        idempotencyKey: mutationId,
      });
      await timed(dependencies, "journal-mark", () =>
        dependencies.journal.mark(mutationId, "source-transcluded"),
      );
    }
    await timed(dependencies, "journal-mark", () =>
      dependencies.journal.mark(mutationId, "complete"),
    );
    return {
      annotation: created,
      assetStored: Boolean(attachment),
      transcluded: Boolean(transclude),
    };
  } catch (error) {
    const problem = error instanceof Error ? error.message : "Unknown annotation creation failure";
    await timed(dependencies, "journal-mark", () =>
      dependencies.journal.mark(mutationId, "failed", problem),
    );
    throw error;
  }
}

import { annotationEmbed, type Annotation } from "../domain/annotation.js";
import { DomainError } from "../domain/errors.js";

import type { SourceRepository } from "./ports.js";
import type { MutationId } from "../domain/identity.js";
import type { Source } from "../domain/source.js";

export async function transcludeAnnotation(
  sources: SourceRepository,
  source: Source,
  annotation: Annotation,
  idempotencyKey: MutationId,
): Promise<Source> {
  if (annotation.collectionId !== source.collectionId || annotation.sourceId !== source.id) {
    throw new DomainError(
      "invalid-annotation",
      "An annotation can only be inserted into its originating source note.",
    );
  }
  const path = annotation.path ?? `annotations/${annotation.id}.md`;
  await sources.appendAnnotationEmbed({
    collectionId: source.collectionId,
    sourceId: source.id,
    expectedRevision: source.recordRevision,
    annotationId: annotation.id,
    embed: annotationEmbed(path),
    idempotencyKey,
  });
  const updated = await sources.get(source.collectionId, source.id);
  if (!updated) {
    throw new DomainError(
      "source-not-found",
      "The source note disappeared after its annotation was inserted.",
    );
  }
  return updated;
}

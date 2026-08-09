import { DomainError } from "../domain/errors.js";

import type { AnnotationRepository } from "./ports.js";
import type { Annotation, AnnotationDeletionPlan } from "../domain/annotation.js";

export function planAnnotationDeletion(
  annotations: AnnotationRepository,
  annotation: Annotation,
): Promise<AnnotationDeletionPlan> {
  requireCanonicalAnnotation(annotation);
  return annotations.preflightDelete(annotation);
}

export async function deleteAnnotation(
  annotations: AnnotationRepository,
  annotation: Annotation,
  plan: AnnotationDeletionPlan,
): Promise<void> {
  requireCanonicalAnnotation(annotation);
  if (
    plan.annotationId !== annotation.id ||
    plan.path !== annotation.path ||
    plan.expectedRevision !== annotation.recordRevision
  ) {
    throw new DomainError(
      "invalid-annotation",
      "This deletion confirmation no longer matches the annotation revision.",
    );
  }
  await annotations.delete(annotation, plan);
}

function requireCanonicalAnnotation(annotation: Annotation): void {
  if (!annotation.path || !annotation.recordRevision) {
    throw new DomainError(
      "invalid-annotation",
      "This annotation does not have a canonical path and revision.",
    );
  }
}

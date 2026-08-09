import { DomainError } from "../domain/errors.js";

import type { AnnotationRepository } from "./ports.js";
import type { Annotation } from "../domain/annotation.js";
import type { DateTime } from "../domain/time.js";

export async function updateAnnotationBody(
  annotations: AnnotationRepository,
  annotation: Annotation,
  body: string,
  modifiedAt: DateTime,
): Promise<Annotation> {
  if (!annotation.path || !annotation.recordRevision) {
    throw new DomainError(
      "invalid-annotation",
      "This annotation does not have a canonical path and revision.",
    );
  }
  return annotations.updateBody({ annotation, body, modifiedAt });
}

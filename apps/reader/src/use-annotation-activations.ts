import { useEffect } from "react";

import type { Annotation } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export function useAnnotationActivations(
  surface: ReadingSurface | null,
  annotations: readonly Annotation[],
  edit: (annotation: Annotation) => void,
): void {
  useEffect(() => {
    const activations = surface?.capabilities.annotationActivation?.activations;
    return activations?.subscribe((annotationId) => {
      const annotation = annotations.find(({ id }) => id === annotationId);
      if (annotation) {
        edit(annotation);
      }
    });
  }, [annotations, edit, surface]);
}

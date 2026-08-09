import { useEffect, useState } from "react";

import { readerErrorMessage } from "./errors.js";

import type { AsyncResource } from "./use-reader-workspace.js";
import type { Annotation } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

interface DecorationProblem {
  readonly surface: ReadingSurface;
  readonly message: string;
}

export function useDocumentDecorations(
  surface: ReadingSurface | null,
  annotations: AsyncResource<readonly Annotation[]>,
): string | null {
  const [problem, setProblem] = useState<DecorationProblem | null>(null);
  useEffect(() => {
    const capability = surface?.capabilities.decorations;
    if (!surface || !capability || annotations.status !== "ready") {
      return;
    }
    let active = true;
    void capability
      .setAnnotations(annotations.value)
      .then(() => {
        if (active) {
          setProblem((current) => (current?.surface === surface ? null : current));
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setProblem({
            surface,
            message: readerErrorMessage(reason, "Reader could not display saved highlights."),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [annotations, surface]);
  return problem?.surface === surface ? problem.message : null;
}

import { useCallback, useEffect, useRef, useState } from "react";

import { navigateToAnnotation } from "./annotation-navigation.js";
import { readerErrorMessage } from "./errors.js";

import type { Annotation, SourceId } from "@mdbase-reader/core";
import type { ReaderLocator, ReadingSurface } from "@mdbase-reader/reading-surface";

export function useAnnotationNavigation(
  sourceId: SourceId | null,
  surface: ReadingSurface | null,
): {
  readonly open: (annotation: Annotation) => void;
  readonly returnToReading: (() => void) | null;
  readonly error: string | null;
  readonly clearError: () => void;
} {
  const [problem, setProblem] = useState<{ sourceId: string; message: string } | null>(null);
  const [point, setPoint] = useState<{
    surface: WeakRef<ReadingSurface>;
    locator: ReaderLocator;
  } | null>(null);
  const pending = useRef<Annotation | null>(null);
  const clearError = useCallback(() => setProblem(null), []);
  const open = useCallback(
    (annotation: Annotation): void => {
      if (!sourceId) {
        return;
      }
      if (!surface) {
        pending.current = annotation;
        return;
      }
      pending.current = null;
      const locator = surface.currentLocation();
      if (locator) {
        setPoint((current) =>
          current?.surface.deref() === surface
            ? current
            : { surface: new WeakRef(surface), locator },
        );
      }
      setProblem(null);
      void navigateToAnnotation(annotation, surface).catch((reason: unknown) =>
        setProblem({
          sourceId,
          message: readerErrorMessage(reason, "Could not locate this annotation."),
        }),
      );
    },
    [surface, sourceId],
  );
  useEffect(() => {
    const annotation = pending.current;
    if (annotation?.sourceId !== sourceId) {
      pending.current = null;
    } else if (surface) {
      open(annotation);
    }
  }, [open, sourceId, surface]);
  const returnToReading =
    point?.surface.deref() === surface && sourceId
      ? (): void => {
          setProblem(null);
          void surface
            .goTo(point.locator)
            .then((found) => {
              if (!found) {
                throw new Error("Could not return to the previous reading position.");
              }
              setPoint(null);
            })
            .catch((reason: unknown) =>
              setProblem({
                sourceId,
                message: readerErrorMessage(reason, "Could not return to reading."),
              }),
            );
        }
      : null;
  return {
    open,
    returnToReading,
    clearError,
    error: problem?.sourceId === sourceId ? problem.message : null,
  };
}

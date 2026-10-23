import { useEffect, useState } from "react";

import type { Annotation, AnnotationId, ReadingPosition } from "@mdbase-reader/core";
import type { ReaderLocator, ReadingSurface } from "@mdbase-reader/reading-surface";

/** Page-level PDF context; reflowable passages use the renderer's already-resolved geometry. */
export function nearestPositionAnnotation(
  annotations: readonly Annotation[],
  surface: ReadingSurface,
  location: ReaderLocator | null,
): AnnotationId | null {
  if (!location) {
    return null;
  }
  let nearest: AnnotationId | null = null;
  let distance = Infinity;
  for (const annotation of annotations) {
    if (
      annotation.document?.fileId !== surface.document.document.fileId ||
      annotation.document.revision !== surface.document.document.revision
    ) {
      continue;
    }
    const next = positionDistance(annotation, location);
    if (next < distance) {
      nearest = annotation.id;
      distance = next;
    }
  }
  return nearest;
}
function positionDistance(annotation: Annotation, location: ReaderLocator): number {
  const position = annotation.target?.position;
  if (location.kind === "pdf") {
    const page =
      annotation.target?.pdf?.pageIndex ??
      (position?.kind === "pdf" ? position.pageIndex : undefined);
    return page === undefined ? Infinity : Math.abs(page - location.pageIndex);
  }
  if (location.kind === "html" && position?.kind === "html") {
    return htmlDistance(location, position);
  }
  if (location.kind === "epub" && position?.kind === "epub") {
    return epubDistance(location.locator, position.locator);
  }
  return Infinity;
}
function htmlDistance(
  location: Extract<ReaderLocator, { kind: "html" }>,
  position: Extract<ReadingPosition, { kind: "html" }>,
): number {
  return position.href === location.href &&
    position.progression !== undefined &&
    location.progression !== undefined
    ? Math.abs(position.progression - location.progression)
    : Infinity;
}
function epubDistance(
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
): number {
  const current = progression(a),
    saved = progression(b);
  return current?.basis === saved?.basis && current && saved
    ? Math.abs(current.value - saved.value)
    : Infinity;
}
function progression(
  locator: Readonly<Record<string, unknown>>,
): { basis: string; value: number } | null {
  const locations = locator["locations"];
  if (!locations || typeof locations !== "object") {
    return null;
  }
  const values = locations as Readonly<Record<string, unknown>>;
  const total = values["totalProgression"];
  if (typeof total === "number") {
    return { basis: "total", value: total };
  }
  const value = values["progression"];
  return typeof value === "number" && typeof locator["href"] === "string"
    ? { basis: locator["href"], value }
    : null;
}

/** Coalesce high-frequency reading events, and never reuse a previous surface's context. */
export function useReadingAnnotation(
  surface: ReadingSurface | null,
  annotations: readonly Annotation[],
): AnnotationId | null {
  const [context, setContext] = useState<{
    surface: ReadingSurface;
    id: AnnotationId | null;
  } | null>(null);
  useEffect(() => {
    if (!surface) {
      return;
    }
    let frame = 0;
    const update = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const resolved = surface.capabilities.decorations?.nearestAnnotation?.();
        const id =
          resolved && annotations.some((annotation) => annotation.id === resolved)
            ? resolved
            : nearestPositionAnnotation(annotations, surface, surface.currentLocation());
        setContext((previous) =>
          previous?.surface === surface && previous.id === id ? previous : { surface, id },
        );
      });
    };
    update();
    const stop = surface.locations.subscribe(update);
    return () => {
      stop();
      cancelAnimationFrame(frame);
    };
  }, [surface, annotations]);
  return context?.surface === surface ? context.id : null;
}

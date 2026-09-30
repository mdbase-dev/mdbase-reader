import { useEffect, useRef } from "react";

import type { AsyncResource } from "./use-reader-workspace.js";
import type { ReaderLibrarySnapshot } from "./workspace-model.js";
import type { Annotation, SourceId } from "@mdbase-reader/core";

/** Never resolve a source link against a different selected collection. */
export function requestedSourceId(url: string, collection: string): string | null {
  const params = new URL(url).searchParams;
  return params.get("collection") === collection ? params.get("source") : null;
}

/** The annotation a source link asks to reveal (by record path or id), for the same collection. */
export function requestedAnnotation(url: string, collection: string): string | null {
  const params = new URL(url).searchParams;
  return params.get("collection") === collection && params.get("source")
    ? params.get("annotation")
    : null;
}

/**
 * Reveals a linked annotation once its source is the active one and the source's annotations have
 * loaded; says whether they loaded without it.
 */
function useAnnotationReveal(
  annotation: string | null,
  source: SourceId | undefined,
  activeSourceId: SourceId | null,
  annotations: AsyncResource<readonly Annotation[]>,
  openAnnotation: ((annotation: Annotation) => void) | undefined,
): boolean {
  const revealed = useRef<string | null>(null);
  const loaded =
    annotation !== null &&
    source !== undefined &&
    source === activeSourceId &&
    annotations.status === "ready"
      ? annotations.value
      : null;
  const target = loaded?.find((item) => item.path === annotation || item.id === annotation);
  useEffect(() => {
    if (target && openAnnotation && revealed.current !== target.id) {
      revealed.current = target.id;
      openAnnotation(target);
    }
  }, [openAnnotation, target]);
  return loaded !== null && !target;
}

export function SourceDeepLink({
  id,
  annotation = null,
  library,
  open,
  activeSourceId = null,
  annotations = { status: "idle" },
  openAnnotation,
}: {
  readonly id: string | null;
  /** An annotation of the linked source to reveal once it is open (its record path or id). */
  readonly annotation?: string | null;
  readonly library: ReaderLibrarySnapshot;
  readonly open: (id: SourceId) => void;
  readonly activeSourceId?: SourceId | null;
  /** The open source's annotations. */
  readonly annotations?: AsyncResource<readonly Annotation[]>;
  readonly openAnnotation?: (annotation: Annotation) => void;
}): React.JSX.Element | null {
  const opened = useRef<string | null>(null);
  const source = library.sources.find((item) => item.id === id);
  useEffect(() => {
    if (source && opened.current !== source.id) {
      opened.current = source.id;
      open(source.id);
    }
  }, [open, source]);
  const annotationMissing = useAnnotationReveal(
    annotation,
    source?.id,
    activeSourceId,
    annotations,
    openAnnotation,
  );
  if (id && !source && library.sourceIndex?.complete !== false) {
    return (
      <p role="alert">
        The linked source is not available in this collection. It may have been removed or your
        access may have changed.
      </p>
    );
  }
  if (annotationMissing) {
    return (
      <p role="alert">
        The linked annotation is not in this source. It may have been removed or moved to another
        source.
      </p>
    );
  }
  return null;
}

import { useCallback, type ReactNode } from "react";

import type { SourceId, SourceSummary } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export type SourceDocumentRenderer = (
  source: SourceSummary,
  onSurfaceChange: (surface: ReadingSurface | null) => void,
) => ReactNode;

export function RenderedSourceDocument({
  source,
  render,
  onSurfaceChange,
}: {
  readonly source: SourceSummary;
  readonly render: SourceDocumentRenderer;
  readonly onSurfaceChange: (sourceId: SourceId, surface: ReadingSurface | null) => void;
}): ReactNode {
  const update = useCallback(
    (surface: ReadingSurface | null): void => onSurfaceChange(source.id, surface),
    [onSurfaceChange, source.id],
  );
  return render(source, update);
}

export function updateSurface(
  current: ReadonlyMap<SourceId, ReadingSurface>,
  sourceId: SourceId,
  surface: ReadingSurface | null,
): ReadonlyMap<SourceId, ReadingSurface> {
  if (current.get(sourceId) === surface || (!surface && !current.has(sourceId))) {
    return current;
  }
  const next = new Map(current);
  if (surface) {
    next.set(sourceId, surface);
  } else {
    next.delete(sourceId);
  }
  return next;
}

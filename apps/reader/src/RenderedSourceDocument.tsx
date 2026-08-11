import { useCallback, type ReactNode } from "react";

import type { SourceSummary } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export type SourceDocumentRenderer = (
  source: SourceSummary,
  onSurfaceChange: (surface: ReadingSurface | null) => void,
) => ReactNode;

export function RenderedSourceDocument({
  source,
  sessionId,
  render,
  onSurfaceChange,
}: {
  readonly source: SourceSummary;
  readonly sessionId: string;
  readonly render: SourceDocumentRenderer;
  readonly onSurfaceChange: (sessionId: string, surface: ReadingSurface | null) => void;
}): ReactNode {
  const update = useCallback(
    (surface: ReadingSurface | null): void => onSurfaceChange(sessionId, surface),
    [onSurfaceChange, sessionId],
  );
  return render(source, update);
}

export function updateSurface(
  current: ReadonlyMap<string, ReadingSurface>,
  sessionId: string,
  surface: ReadingSurface | null,
): ReadonlyMap<string, ReadingSurface> {
  if (current.get(sessionId) === surface || (!surface && !current.has(sessionId))) {
    return current;
  }
  const next = new Map(current);
  if (surface) {
    next.set(sessionId, surface);
  } else {
    next.delete(sessionId);
  }
  return next;
}

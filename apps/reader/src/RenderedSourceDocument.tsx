import { Trans } from "@lingui/react/macro";
import { useCallback, useEffect, type ReactNode } from "react";

import { markPwaInstallEligible } from "./pwa-install.js";

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
  useEffect(() => {
    markPwaInstallEligible();
  }, []);
  return (
    <div className="source-document">
      <header className="source-document-heading">
        <h1>{source.title}</h1>
        <small>
          <Trans>Saved document · original headings below are unchanged</Trans>
        </small>
      </header>
      <div className="source-document-surface">{render(source, update)}</div>
    </div>
  );
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

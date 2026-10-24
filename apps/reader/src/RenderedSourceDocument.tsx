import { useCallback, useEffect, type ReactNode } from "react";

import { isHtml } from "./document-media.js";
import { markPwaInstallEligible } from "./pwa-install.js";
import { bindSurfaceReadingContext, sourceReadingContextKey } from "./source-reading-range.js";

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
  const contextKey = sourceReadingContextKey(source);
  const update = useCallback(
    (surface: ReadingSurface | null): void => {
      if (surface) {
        bindSurfaceReadingContext(surface, contextKey);
      }
      onSurfaceChange(sessionId, surface);
    },
    [contextKey, onSurfaceChange, sessionId],
  );
  useEffect(() => {
    markPwaInstallEligible();
  }, []);
  return (
    <div className="source-document">
      <header className="source-document-heading">
        <h1>{source.title}</h1>
        {isSavedWebPage(source) ? (
          <small>Saved web page · original headings below are unchanged</small>
        ) : null}
      </header>
      <div className="source-document-surface">{render(source, update)}</div>
    </div>
  );
}

/** Only a saved web page keeps headings of its own that a renamed title can differ from. */
function isSavedWebPage(source: SourceSummary): boolean {
  const document = source.documents[0];
  return document ? isHtml(document.mediaType, document.file) : false;
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

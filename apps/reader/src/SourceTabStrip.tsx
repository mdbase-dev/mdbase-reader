import { CloseIcon } from "./icons.js";

import type { SourceId, SourceSummary } from "@mdbase-reader/core";
import type { JSX } from "react";

export interface SourceTabStripProps {
  readonly sources: readonly SourceSummary[];
  readonly activeSourceId: SourceId | null;
  readonly onActivate: (sourceId: SourceId) => void;
  readonly onClose: (sourceId: SourceId) => void;
}

export function SourceTabStrip({
  sources,
  activeSourceId,
  onActivate,
  onClose,
}: SourceTabStripProps): JSX.Element | null {
  if (sources.length === 0) {
    return null;
  }
  return (
    <div className="source-tab-strip" role="tablist" aria-label="Open sources">
      <div className="source-tab-track">
        {sources.map((source) => {
          const active = source.id === activeSourceId;
          return (
            <div className={active ? "source-tab is-active" : "source-tab"} key={source.id}>
              <button
                className="source-tab-select"
                type="button"
                role="tab"
                aria-selected={active}
                title={source.title}
                onClick={() => onActivate(source.id)}
              >
                <span className="source-tab-format">{sourceFormat(source)}</span>
                <span className="source-tab-title">{source.title}</span>
              </button>
              <button
                className="source-tab-close"
                type="button"
                aria-label={`Close ${source.title}`}
                title="Close source"
                onClick={() => onClose(source.id)}
              >
                <CloseIcon />
              </button>
            </div>
          );
        })}
      </div>
      <span className="source-tab-context" aria-hidden="true">
        Working set
      </span>
    </div>
  );
}

export function sourceFormat(source: SourceSummary): string {
  const mediaType = source.documents[0]?.mediaType ?? "";
  if (mediaType.includes("pdf")) {
    return "PDF";
  }
  if (mediaType.includes("epub")) {
    return "EPUB";
  }
  if (mediaType.includes("html")) {
    return "WEB";
  }
  return source.documents[0] ? "FILE" : "NOTE";
}

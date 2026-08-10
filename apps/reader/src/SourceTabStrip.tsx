import { CloseIcon } from "./icons.js";

import type { SourceId, SourceSummary } from "@mdbase-reader/core";
import type { JSX, KeyboardEvent } from "react";

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
                tabIndex={active ? 0 : -1}
                title={source.title}
                onClick={() => onActivate(source.id)}
                onKeyDown={(event) => handleTabKey(event, sources, source.id, onActivate)}
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

function handleTabKey(
  event: KeyboardEvent<HTMLButtonElement>,
  sources: readonly SourceSummary[],
  sourceId: SourceId,
  activate: (sourceId: SourceId) => void,
): void {
  const index = sources.findIndex(({ id }) => id === sourceId);
  const nextIndex = tabDestination(event.key, index, sources.length);
  if (nextIndex === null) {
    return;
  }
  const next = sources[nextIndex];
  if (!next) {
    return;
  }
  event.preventDefault();
  const tabList = event.currentTarget.closest<HTMLElement>('[role="tablist"]');
  const destination = tabList?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex];
  destination?.focus();
  activate(next.id);
}

export function tabDestination(key: string, current: number, count: number): number | null {
  if (count < 1 || current < 0) {
    return null;
  }
  if (key === "ArrowRight") {
    return (current + 1) % count;
  }
  if (key === "ArrowLeft") {
    return (current - 1 + count) % count;
  }
  if (key === "Home") {
    return 0;
  }
  return key === "End" ? count - 1 : null;
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

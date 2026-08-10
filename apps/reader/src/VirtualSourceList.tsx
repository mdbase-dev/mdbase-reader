import { useVirtualSourceWindow } from "./use-virtual-source-window.js";
import { keyboardSourceIndex } from "./virtual-source-list.js";

import type { LibraryPresentation } from "./workspace-shell-preferences.js";
import type { SourceId, SourceSummary, SourceTextSearchMatch } from "@mdbase-reader/core";
import type { CSSProperties, JSX, KeyboardEvent } from "react";

export interface VirtualSourceListProps {
  readonly sources: readonly SourceSummary[];
  readonly selectedSourceId: SourceId | null;
  readonly searchMatches: ReadonlyMap<SourceId, SourceTextSearchMatch>;
  readonly resetKey: string;
  readonly busy: boolean;
  readonly presentation: LibraryPresentation;
  readonly onSelectSource: (id: SourceId) => void;
  readonly onOpenSource: (id: SourceId) => void;
  readonly onOpenBeside: (id: SourceId) => void;
}

export function VirtualSourceList({
  sources,
  selectedSourceId,
  searchMatches,
  resetKey,
  busy,
  presentation,
  onSelectSource,
  onOpenSource,
  onOpenBeside,
}: VirtualSourceListProps): JSX.Element {
  const { containerRef, range, measure, focusIndex } = useVirtualSourceWindow(
    sources.length,
    resetKey,
    sourceRowHeight(presentation),
  );

  function navigateFrom(event: KeyboardEvent, currentIndex: number): void {
    const nextIndex = keyboardSourceIndex(event.key, currentIndex, sources.length);
    if (nextIndex === null) {
      return;
    }
    const nextSource = sources[nextIndex];
    if (!nextSource) {
      return;
    }
    event.preventDefault();
    onSelectSource(nextSource.id);
    focusIndex(nextIndex);
  }

  const windowStyle = {
    transform: `translateY(${String(range.offset)}px)`,
  } satisfies CSSProperties;
  const spacerStyle = { height: `${String(range.totalHeight)}px` } satisfies CSSProperties;

  return (
    <div
      ref={containerRef}
      className={`source-list is-${presentation}`}
      role="listbox"
      aria-label="Sources"
      aria-busy={busy}
      onScroll={measure}
    >
      <div className="source-list-spacer" style={spacerStyle}>
        <div className="source-list-window" style={windowStyle}>
          {sources.slice(range.start, range.end).map((source, relativeIndex) => {
            const index = range.start + relativeIndex;
            const selected = source.id === selectedSourceId;
            return (
              <button
                key={source.id}
                type="button"
                role="option"
                aria-selected={selected}
                aria-posinset={index + 1}
                aria-setsize={sources.length}
                data-source-index={index}
                tabIndex={selected || index === range.start ? 0 : -1}
                className={selected ? "source-row is-selected" : "source-row"}
                onClick={() => onSelectSource(source.id)}
                onDoubleClick={() => onOpenSource(source.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onOpenBeside(source.id);
                }}
                onKeyDown={(event) => navigateFrom(event, index)}
              >
                <span className="source-format">{sourceFormat(source)}</span>
                <strong>{source.title}</strong>
                <small>{source.creators.join(", ") || "Unknown creator"}</small>
                <span className="source-row-meta">
                  {searchMatchLabel(searchMatches.get(source.id)) ?? sourceStatusLabel(source)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function sourceRowHeight(presentation: LibraryPresentation): number {
  return presentation === "compact" ? 72 : presentation === "bibliography" ? 96 : 124;
}

function sourceFormat(source: SourceSummary): "PDF" | "EPUB" | "WEB" | "NOTE" {
  const mediaType = source.documents[0]?.mediaType ?? "";
  if (!source.documents[0]) {
    return "NOTE";
  }
  if (mediaType.includes("pdf")) {
    return "PDF";
  }
  return mediaType.includes("epub") ? "EPUB" : "WEB";
}

function sourceStatusLabel(source: SourceSummary): string {
  const status = source.readingStatus ?? "inbox";
  const citation = source.citation
    ? "cited"
    : source.citationProblems?.length
      ? "citation issue"
      : "no citation";
  return `${status} · ${citation}`;
}

function searchMatchLabel(match: SourceTextSearchMatch | undefined): string | null {
  if (!match) {
    return null;
  }
  if (match.kinds.includes("document")) {
    return match.kinds.length > 1 ? "document + note match" : "document match";
  }
  return match.kinds.includes("source-note") ? "note match" : "annotation match";
}

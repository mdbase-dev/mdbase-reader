import { ReaderButton } from "@mdbase-reader/ui";

import { LibraryIcon, MoreIcon, SearchIcon } from "./icons.js";

import type { SourceId, SourceSummary } from "@mdbase-reader/core";
import type { JSX } from "react";

export interface LibraryPaneProps {
  readonly sources: readonly SourceSummary[];
  readonly visibleSources: readonly SourceSummary[];
  readonly selectedSourceId: SourceId | null;
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
  readonly onSelectSource: (id: SourceId) => void;
}

export function LibraryPane({
  sources,
  visibleSources,
  selectedSourceId,
  search,
  onSearchChange,
  onSelectSource,
}: LibraryPaneProps): JSX.Element {
  return (
    <aside className="library-pane" aria-label="Library">
      <div className="pane-heading">
        <span>
          <LibraryIcon /> Library
        </span>
        <button className="icon-button" type="button" aria-label="Library actions">
          <MoreIcon />
        </button>
      </div>
      <label className="library-search">
        <SearchIcon />
        <span className="sr-only">Search sources</span>
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search library"
        />
        <kbd>⌘K</kbd>
      </label>
      <nav className="status-nav" aria-label="Reading status">
        <button className="is-active" type="button">
          All <span>{sources.length}</span>
        </button>
        <button type="button">
          Reading{" "}
          <span>{sources.filter(({ readingStatus }) => readingStatus === "reading").length}</span>
        </button>
        <button type="button">Queued</button>
      </nav>
      <div className="source-list">
        {visibleSources.map((source) => (
          <button
            key={source.id}
            type="button"
            className={source.id === selectedSourceId ? "source-row is-selected" : "source-row"}
            onClick={() => onSelectSource(source.id)}
          >
            <span className="source-format">{sourceFormat(source)}</span>
            <strong>{source.title}</strong>
            <small>{source.creators.join(", ") || "Unknown creator"}</small>
            <span className="source-row-meta">{source.readingStatus ?? "inbox"}</span>
          </button>
        ))}
      </div>
      <div className="library-footer">
        <ReaderButton>+ Add source</ReaderButton>
      </div>
    </aside>
  );
}

function sourceFormat(source: SourceSummary): "PDF" | "EPUB" | "WEB" {
  const mediaType = source.documents[0]?.mediaType ?? "";
  if (mediaType.includes("pdf")) {
    return "PDF";
  }
  return mediaType.includes("epub") ? "EPUB" : "WEB";
}

import { ReaderButton } from "@mdbase-reader/ui";

import { DownloadIcon, LibraryIcon, MoreIcon, PlusIcon, SearchIcon } from "./icons.js";

import type { BibliographyExportController } from "./use-bibliography-export.js";
import type { SourceId, SourceSummary } from "@mdbase-reader/core";
import type { JSX } from "react";

export interface LibraryPaneProps {
  readonly sources: readonly SourceSummary[];
  readonly visibleSources: readonly SourceSummary[];
  readonly selectedSourceId: SourceId | null;
  readonly search: string;
  readonly filter: LibraryFilter;
  readonly onSearchChange: (value: string) => void;
  readonly onFilterChange: (filter: LibraryFilter) => void;
  readonly onSelectSource: (id: SourceId) => void;
  readonly onAddSource: () => void;
  readonly addingSource: boolean;
  readonly bibliographyExport: BibliographyExportController;
}

export type LibraryFilter = "all" | "queued" | "reading";

export function LibraryPane({
  sources,
  visibleSources,
  selectedSourceId,
  search,
  filter,
  onSearchChange,
  onFilterChange,
  onSelectSource,
  onAddSource,
  addingSource,
  bibliographyExport,
}: LibraryPaneProps): JSX.Element {
  return (
    <aside className="library-pane" aria-label="Library">
      <div className="pane-heading">
        <span>
          <LibraryIcon /> Library
        </span>
        <LibraryActions bibliographyExport={bibliographyExport} />
      </div>
      <label className="library-search">
        <SearchIcon />
        <span className="sr-only">Search sources</span>
        <input
          id="reader-library-search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search library"
        />
        <kbd>⌘K</kbd>
      </label>
      <nav className="status-nav" aria-label="Reading status">
        <button
          className={filter === "all" ? "is-active" : undefined}
          type="button"
          aria-pressed={filter === "all"}
          onClick={() => onFilterChange("all")}
        >
          All <span>{sources.length}</span>
        </button>
        <button
          className={filter === "reading" ? "is-active" : undefined}
          type="button"
          aria-pressed={filter === "reading"}
          onClick={() => onFilterChange("reading")}
        >
          Reading{" "}
          <span>{sources.filter(({ readingStatus }) => readingStatus === "reading").length}</span>
        </button>
        <button
          className={filter === "queued" ? "is-active" : undefined}
          type="button"
          aria-pressed={filter === "queued"}
          onClick={() => onFilterChange("queued")}
        >
          Queued
          <span>{sources.filter(({ readingStatus }) => readingStatus === "queued").length}</span>
        </button>
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
        {visibleSources.length === 0 ? (
          <div className="library-empty">
            <strong>No matching sources</strong>
            <span>Try another search or reading status.</span>
          </div>
        ) : null}
      </div>
      <div className="library-footer">
        <ReaderButton disabled={addingSource} onClick={onAddSource}>
          <PlusIcon /> {addingSource ? "Adding…" : "Add source"}
        </ReaderButton>
      </div>
    </aside>
  );
}

function LibraryActions({
  bibliographyExport,
}: {
  readonly bibliographyExport: BibliographyExportController;
}): JSX.Element {
  const actionLabel = bibliographyExport.itemCount
    ? `${String(bibliographyExport.itemCount)} ready to export`
    : "No citations ready";
  return (
    <details className="library-actions">
      <summary className="icon-button" aria-label="Library actions" title="Library actions">
        <MoreIcon />
      </summary>
      <div className="library-actions-menu">
        <button
          type="button"
          className="library-action"
          disabled={bibliographyExport.status === "exporting"}
          onClick={bibliographyExport.run}
        >
          <DownloadIcon />
          <span>
            <strong>
              {bibliographyExport.status === "exporting"
                ? "Preparing bibliography…"
                : "Export bibliography"}
            </strong>
            <small>{actionLabel}</small>
          </span>
        </button>
        {bibliographyExport.problemSummary ? (
          <p className="library-export-problems">{bibliographyExport.problemSummary}</p>
        ) : null}
        {bibliographyExport.message ? (
          <p
            className={`library-export-message is-${bibliographyExport.status}`}
            role={bibliographyExport.status === "error" ? "alert" : "status"}
          >
            {bibliographyExport.message}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function sourceFormat(source: SourceSummary): "PDF" | "EPUB" | "WEB" {
  const mediaType = source.documents[0]?.mediaType ?? "";
  if (mediaType.includes("pdf")) {
    return "PDF";
  }
  return mediaType.includes("epub") ? "EPUB" : "WEB";
}

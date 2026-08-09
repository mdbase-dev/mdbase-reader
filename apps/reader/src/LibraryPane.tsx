import {
  readingStatuses,
  type ReadingStatus,
  type SourceId,
  type SourceSummary,
  type SourceTextSearchMatch,
} from "@mdbase-reader/core";
import { ReaderButton } from "@mdbase-reader/ui";

import { DownloadIcon, LibraryIcon, MoreIcon, PlusIcon, SearchIcon } from "./icons.js";
import { VirtualSourceList } from "./VirtualSourceList.js";

import type { BibliographyExportController } from "./use-bibliography-export.js";
import type { LibrarySearchStatus } from "./use-library-search.js";
import type { ReaderLibrarySnapshot } from "./workspace-model.js";
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
  readonly searchMatches: ReadonlyMap<SourceId, SourceTextSearchMatch>;
  readonly searchStatus: LibrarySearchStatus;
  readonly searchProblem: string | null;
  readonly sourceIndex?: ReaderLibrarySnapshot["sourceIndex"];
}

export type LibraryFilter = "all" | ReadingStatus;
const libraryFilters: readonly LibraryFilter[] = ["all", ...readingStatuses];

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
  searchMatches,
  searchStatus,
  searchProblem,
  sourceIndex,
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
        {searchStatus === "searching" ? (
          <span className="library-search-progress" aria-hidden="true">
            ···
          </span>
        ) : (
          <kbd>⌘K</kbd>
        )}
      </label>
      <span className="sr-only" role="status" aria-live="polite">
        {searchStatus === "searching"
          ? "Searching source notes, annotations, and opened documents."
          : ""}
      </span>
      <nav className="status-nav" aria-label="Reading status">
        {libraryFilters.map((status) => (
          <button
            key={status}
            className={filter === status ? "is-active" : undefined}
            type="button"
            aria-pressed={filter === status}
            onClick={() => onFilterChange(status)}
          >
            {statusLabel(status)}
            <span>
              {status === "all"
                ? sourceCountLabel(sources.length, sourceIndex)
                : sources.filter((source) => effectiveReadingStatus(source) === status).length}
            </span>
          </button>
        ))}
      </nav>
      <span className="sr-only" role="status" aria-live="polite">
        {sourceIndex?.complete === false
          ? `Loaded ${String(sourceIndex.loaded)}${sourceIndex.total ? ` of ${String(sourceIndex.total)}` : ""} sources.`
          : ""}
      </span>
      {visibleSources.length > 0 ? (
        <VirtualSourceList
          sources={visibleSources}
          selectedSourceId={selectedSourceId}
          searchMatches={searchMatches}
          resetKey={`${filter}:${search}`}
          busy={sourceIndex?.complete === false}
          onSelectSource={onSelectSource}
        />
      ) : (
        <div className="library-empty">
          <strong>
            {searchStatus === "searching" ? "Searching notes…" : "No matching sources"}
          </strong>
          <span>
            {searchProblem ??
              (searchStatus === "searching"
                ? "Checking source notes and annotations."
                : "Try another search or reading status.")}
          </span>
        </div>
      )}
      <div className="library-footer">
        <ReaderButton disabled={addingSource} onClick={onAddSource}>
          <PlusIcon /> {addingSource ? "Adding…" : "Add source"}
        </ReaderButton>
      </div>
    </aside>
  );
}

function effectiveReadingStatus(source: SourceSummary): ReadingStatus {
  return source.readingStatus ?? "inbox";
}

function statusLabel(status: LibraryFilter): string {
  return status.charAt(0).toLocaleUpperCase() + status.slice(1);
}

function sourceCountLabel(
  loaded: number,
  sourceIndex: ReaderLibrarySnapshot["sourceIndex"],
): string {
  return sourceIndex?.complete === false && sourceIndex.total
    ? `${String(loaded)}/${String(sourceIndex.total)}`
    : String(loaded);
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

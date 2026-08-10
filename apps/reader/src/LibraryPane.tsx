import { ReaderButton } from "@mdbase-reader/ui";

import { DownloadIcon, LibraryIcon, MoreIcon, PlusIcon, SearchIcon } from "./icons.js";
import { LibraryLensBar } from "./LibraryLensBar.js";
import { VirtualSourceList } from "./VirtualSourceList.js";

import type { LibraryLensId } from "./library-lenses.js";
import type { LibrarySort, SavedLibraryLens } from "./library-view-state.js";
import type { BibliographyExportController } from "./use-bibliography-export.js";
import type { LibrarySearchStatus } from "./use-library-search.js";
import type { ReaderLibrarySnapshot } from "./workspace-model.js";
import type { LibraryPresentation } from "./workspace-shell-preferences.js";
import type { SourceId, SourceSummary, SourceTextSearchMatch } from "@mdbase-reader/core";
import type { JSX } from "react";

export interface LibraryPaneProps {
  readonly sources: readonly SourceSummary[];
  readonly visibleSources: readonly SourceSummary[];
  readonly selectedSourceId: SourceId | null;
  readonly search: string;
  readonly lens: LibraryLensId;
  readonly sort: LibrarySort;
  readonly savedLenses: readonly SavedLibraryLens[];
  readonly onSearchChange: (value: string) => void;
  readonly onLensChange: (lens: LibraryLensId) => void;
  readonly onSortChange: (sort: LibrarySort) => void;
  readonly onSaveLens: (name: string) => void;
  readonly onApplySavedLens: (id: string) => void;
  readonly onRemoveSavedLens: (id: string) => void;
  readonly presentation: LibraryPresentation;
  readonly onPresentationChange: (presentation: LibraryPresentation) => void;
  readonly onSelectSource: (id: SourceId) => void;
  readonly onOpenSource: (id: SourceId) => void;
  readonly onOpenBeside: (id: SourceId) => void;
  readonly onAddSource: () => void;
  readonly addingSource: boolean;
  readonly bibliographyExport: BibliographyExportController;
  readonly searchMatches: ReadonlyMap<SourceId, SourceTextSearchMatch>;
  readonly searchStatus: LibrarySearchStatus;
  readonly searchProblem: string | null;
  readonly sourceIndex?: ReaderLibrarySnapshot["sourceIndex"];
}

export function LibraryPane({
  sources,
  visibleSources,
  selectedSourceId,
  search,
  lens,
  sort,
  savedLenses,
  onSearchChange,
  onLensChange,
  onSortChange,
  onSaveLens,
  onApplySavedLens,
  onRemoveSavedLens,
  presentation,
  onPresentationChange,
  onSelectSource,
  onOpenSource,
  onOpenBeside,
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
        <span className="sr-only">Filter library</span>
        <input
          id="reader-library-search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Filter library"
        />
        {searchStatus === "searching" ? (
          <span className="library-search-progress" aria-hidden="true">
            ···
          </span>
        ) : (
          <kbd>⌘F</kbd>
        )}
      </label>
      <span className="sr-only" role="status" aria-live="polite">
        {searchStatus === "searching"
          ? "Searching source notes, annotations, and opened documents."
          : ""}
      </span>
      <LibraryLensBar
        lens={lens}
        sort={sort}
        savedLenses={savedLenses}
        count={sourceCountSummary(visibleSources.length, sources.length, sourceIndex)}
        presentation={presentation}
        onLensChange={onLensChange}
        onSortChange={onSortChange}
        onSaveLens={onSaveLens}
        onApplySavedLens={onApplySavedLens}
        onRemoveSavedLens={onRemoveSavedLens}
        onPresentationChange={onPresentationChange}
      />
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
          resetKey={`${lens}:${search}:${presentation}`}
          presentation={presentation}
          busy={sourceIndex?.complete === false}
          onSelectSource={onSelectSource}
          onOpenSource={onOpenSource}
          onOpenBeside={onOpenBeside}
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

function sourceCountLabel(
  loaded: number,
  sourceIndex: ReaderLibrarySnapshot["sourceIndex"],
): string {
  return sourceIndex?.complete === false && sourceIndex.total
    ? `${String(loaded)}/${String(sourceIndex.total)}`
    : String(loaded);
}

function sourceCountSummary(
  visible: number,
  loaded: number,
  sourceIndex: ReaderLibrarySnapshot["sourceIndex"],
): string {
  const total = sourceCountLabel(loaded, sourceIndex);
  return visible === loaded
    ? `${total} ${visible === 1 ? "source" : "sources"}`
    : `${String(visible)} of ${total} sources`;
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

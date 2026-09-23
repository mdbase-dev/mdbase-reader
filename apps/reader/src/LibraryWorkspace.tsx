/* eslint-disable complexity, max-lines, max-lines-per-function */
import { useEffect, useId, useMemo, useState, type JSX, type KeyboardEvent } from "react";

import { ContinueReading } from "./ContinueReading.js";
import { readerErrorMessage } from "./errors.js";
import {
  ChevronDownIcon,
  DownloadIcon,
  FilterIcon,
  ImportIcon,
  LibraryIcon,
  PlusIcon,
  SearchIcon,
} from "./icons.js";
import { importHref } from "./import-navigation.js";
import { publicationDateLabel } from "./library-publication-date.js";
import { LibraryTextSearch, type LibrarySearchScope } from "./LibraryTextSearch.js";
import {
  applyLibraryViewConfiguration,
  columnLabel,
  sourceFormat,
  type LibraryColumn,
  type LibraryViewConfiguration,
  type MdbaseLibraryView,
} from "./mdbase-library-views.js";
import { Menu } from "./Menu.js";

import type { BibliographyExportController } from "./use-bibliography-export.js";
import type { MdbaseLibraryViewsController } from "./use-mdbase-library-views.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { ReadingStatus, Source, SourceId, SourceSummary } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export function LibraryWorkspace({
  view,
  availableViews,
  allSources,
  gateway,
  controller,
  focused,
  onOpenView,
  onPreviewSource,
  onOpenSource,
  onOpenBeside,
  onAddSource,
  onOpenSourceView,
  surfaces,
  bibliographyExport,
  onSourceChanged,
}: {
  readonly bibliographyExport: BibliographyExportController;
  readonly onSourceChanged?: (source: Source) => void;
  readonly surfaces?: ReadonlyMap<string, ReadingSurface>;
  readonly onOpenSourceView?: (id: SourceId, view: "document" | "note" | "annotations") => void;
  readonly view: MdbaseLibraryView;
  readonly availableViews: readonly MdbaseLibraryView[];
  readonly allSources: readonly SourceSummary[];
  readonly gateway: ReaderWorkspaceGateway;
  readonly controller: MdbaseLibraryViewsController;
  readonly focused: boolean;
  readonly onOpenView: (view: MdbaseLibraryView) => void;
  readonly onPreviewSource: (sourceId: SourceId) => void;
  readonly onOpenSource: (sourceId: SourceId) => void;
  readonly onOpenBeside: (sourceId: SourceId) => void;
  readonly onAddSource: () => void;
}): JSX.Element {
  const [configuration, setConfiguration] = useState(view.configuration);
  const [searchScope, setSearchScope] = useState<LibrarySearchScope>("sources");
  const [contentQuery, setContentQuery] = useState("");
  const [page, setPage] = useState(0);
  const [executedSources, setExecutedSources] = useState<readonly SourceSummary[]>(allSources);
  const [loading, setLoading] = useState(Boolean(view.path));
  const [problem, setProblem] = useState<string | null>(null);
  const saveStatus = gateway.saveReadingStatus?.bind(gateway);
  const changeStatus = saveStatus
    ? (id: SourceId, status: ReadingStatus): void => {
        setProblem(null);
        void saveStatus(id, status)
          .then((updated) => onSourceChanged?.(updated))
          .catch((reason: unknown) =>
            setProblem(readerErrorMessage(reason, "Reader could not change the reading status.")),
          );
      }
    : undefined;
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const executionFamily = `reader-library-view:${useId()}`;

  useEffect(() => {
    const controller = new AbortController();
    void gateway
      .executeLibraryView(view, {
        signal: controller.signal,
        replaceableFamily: executionFamily,
      })
      .then((result) => {
        if (!controller.signal.aborted) {
          setExecutedSources(result.sources);
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setProblem(readerErrorMessage(reason, "Reader could not execute this mdbase view."));
          setExecutedSources(allSources);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => {
      controller.abort();
    };
  }, [allSources, executionFamily, gateway, view]);

  const dirty = !sameConfiguration(configuration, view.configuration);
  const filterCount = activeFilterCount(configuration);
  // Prefer the library's copy of each source, so edits such as a status change show at once.
  const freshSources = useMemo(() => {
    const byId = new Map(allSources.map((source) => [source.id, source]));
    return executedSources.map((source) => byId.get(source.id) ?? source);
  }, [allSources, executedSources]);
  const baseSources = dirty ? allSources : freshSources;
  const sources = useMemo(
    () =>
      applyLibraryViewConfiguration(
        baseSources,
        searchScope === "sources"
          ? configuration
          : {
              ...configuration,
              filter: { ...configuration.filter, query: "" },
            },
      ),
    [baseSources, configuration, searchScope],
  );
  const update = (value: Partial<LibraryViewConfiguration>): void => {
    setPage(0);
    setConfiguration((current) => ({ ...current, ...value }));
  };
  const updateFilter = (value: Partial<LibraryViewConfiguration["filter"]>): void => {
    setPage(0);
    setConfiguration((current) => ({ ...current, filter: { ...current.filter, ...value } }));
  };
  const pageCount = Math.max(1, Math.ceil(sources.length / 100));
  const currentPage = Math.min(page, pageCount - 1);
  const pageSources = sources.slice(currentPage * 100, (currentPage + 1) * 100);

  const save = async (replace: boolean): Promise<void> => {
    const name = saveName.trim();
    if (!name) {
      return;
    }
    const saved = await controller.save({
      name,
      configuration,
      ...(replace && view.path && view.owned ? { existing: view } : {}),
    });
    setSaving(false);
    onOpenView(saved);
  };

  return (
    <section className="library-workspace" aria-label={`${view.name} library view`}>
      <header className="library-workspace-header">
        <label className="library-view-identity">
          <span className="sr-only">Library view</span>
          <select
            value={view.key}
            onChange={(event) => {
              const next = availableViews.find(({ key }) => key === event.target.value);
              if (next) {
                onOpenView(next);
              }
            }}
          >
            {availableViews.map((candidate) => (
              <option key={candidate.key} value={candidate.key}>
                {candidate.name}
              </option>
            ))}
          </select>
          <ChevronDownIcon aria-hidden="true" />
        </label>
        <div className="library-workspace-search">
          <SearchIcon />
          <label className="library-search-field">
            <span className="sr-only">Search this view</span>
            <input
              value={searchScope === "sources" ? configuration.filter.query : contentQuery}
              placeholder={
                searchScope === "sources"
                  ? "Search titles, authors and tags"
                  : searchScope === "notes"
                    ? "Search notes and annotations"
                    : "Search open documents"
              }
              onChange={(event) =>
                searchScope === "sources"
                  ? updateFilter({ query: event.target.value })
                  : setContentQuery(event.target.value)
              }
            />
          </label>
          <select
            aria-label="Search scope"
            className="library-search-scope"
            value={searchScope}
            onChange={(event) => {
              setSearchScope(event.target.value as LibrarySearchScope);
              setPage(0);
            }}
          >
            <option value="sources">Sources</option>
            <option value="notes">Notes</option>
            <option value="documents">Open documents</option>
          </select>
        </div>
        <div className="library-header-trailing">
          {searchScope === "sources" ? (
            <span className="library-result-count" role="status">
              {loading ? "Loading…" : countLabel(sources.length, "source")}
            </span>
          ) : null}
          {dirty && view.owned && view.writable ? (
            <button
              className="library-save-button"
              type="button"
              disabled={controller.saving}
              onClick={() => void save(true)}
            >
              Save view
            </button>
          ) : null}
          <Menu
            className="library-workspace-more"
            label={`View options${filterCount ? `, ${String(filterCount)} active filters` : ""}`}
            title="View options"
            trigger={
              <>
                <FilterIcon />
                {filterCount ? <span className="menu-badge">{filterCount}</span> : null}
              </>
            }
          >
            <div className="library-options" data-menu-keep-open>
              <span className="menu-label">Filter</span>
              <label>
                <span>Status</span>
                <select
                  value={configuration.filter.status}
                  onChange={(event) =>
                    updateFilter({
                      status: event.target.value as LibraryViewConfiguration["filter"]["status"],
                    })
                  }
                >
                  <option value="all">Any status</option>
                  <option value="inbox">Inbox</option>
                  <option value="queued">Queued</option>
                  <option value="reading">Reading</option>
                  <option value="finished">Finished</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label>
                <span>Format</span>
                <select
                  value={configuration.filter.format}
                  onChange={(event) =>
                    updateFilter({
                      format: event.target.value as LibraryViewConfiguration["filter"]["format"],
                    })
                  }
                >
                  <option value="all">Any format</option>
                  <option value="pdf">PDF</option>
                  <option value="epub">EPUB</option>
                  <option value="web">Saved web page</option>
                  <option value="note">Note only</option>
                </select>
              </label>
              <label>
                <span>Tag</span>
                <input
                  value={configuration.filter.tag}
                  placeholder="Any tag"
                  onChange={(event) => updateFilter({ tag: event.target.value })}
                />
              </label>
              {filterCount > 0 ? (
                <button
                  className="library-clear-filters"
                  type="button"
                  onClick={() => updateFilter({ status: "all", format: "all", tag: "" })}
                >
                  Clear filters
                </button>
              ) : null}
              <span className="menu-label">Sort</span>
              <div className="library-sort-control">
                <select
                  aria-label="Sort field"
                  value={configuration.sortField}
                  onChange={(event) =>
                    update({
                      sortField: event.target.value as LibraryViewConfiguration["sortField"],
                    })
                  }
                >
                  <option value="saved">Recently saved</option>
                  <option value="title">Title</option>
                  <option value="creator">Creator</option>
                  <option value="published">Published</option>
                  <option value="status">Status</option>
                </select>
                <button
                  type="button"
                  aria-label={`Sort ${configuration.sortDirection === "asc" ? "descending" : "ascending"}`}
                  title={configuration.sortDirection === "asc" ? "Ascending" : "Descending"}
                  onClick={() =>
                    update({
                      sortDirection: configuration.sortDirection === "asc" ? "desc" : "asc",
                    })
                  }
                >
                  {configuration.sortDirection === "asc" ? "↑" : "↓"}
                </button>
              </div>
              <span className="menu-label">Layout</span>
              <div className="segmented-control" aria-label="Library presentation">
                {(["table", "cards"] as const).map((presentation) => (
                  <button
                    key={presentation}
                    type="button"
                    aria-pressed={configuration.presentation === presentation}
                    onClick={() => update({ presentation })}
                  >
                    {presentation === "table" ? "Table" : "Cards"}
                  </button>
                ))}
              </div>
              {configuration.presentation === "table" ? (
                <>
                  <span className="menu-label">Columns</span>
                  <div className="library-column-panel">
                    {allColumns
                      .filter((column) => column !== "title")
                      .map((column) => (
                        <label key={column}>
                          <input
                            type="checkbox"
                            checked={configuration.columns.includes(column)}
                            onChange={() =>
                              update({ columns: toggleColumn(configuration.columns, column) })
                            }
                          />
                          {columnLabel(column)}
                        </label>
                      ))}
                  </div>
                </>
              ) : null}
            </div>
            <hr />
            <button type="button" onClick={() => setSaving(true)}>
              Save as new view…
            </button>
            <button
              type="button"
              disabled={bibliographyExport.status === "exporting"}
              onClick={bibliographyExport.run}
            >
              <DownloadIcon />
              {bibliographyExport.status === "exporting"
                ? "Preparing bibliography…"
                : "Export bibliography"}
            </button>
            <a href={importHref()} target="_blank" rel="noopener noreferrer">
              <ImportIcon />
              Import a library…
            </a>
            {bibliographyExport.message ? (
              <p className={`menu-note${bibliographyExport.status === "error" ? " is-error" : ""}`}>
                {bibliographyExport.message}
              </p>
            ) : null}
          </Menu>
          <button
            className="icon-button library-add-button"
            type="button"
            aria-label="Add source"
            title="Add source"
            onClick={onAddSource}
          >
            <PlusIcon />
          </button>
        </div>
      </header>

      {(problem ?? controller.problem) ? (
        <div className="library-view-problem" role="alert">
          {problem ?? controller.problem}
        </div>
      ) : null}

      <div className="library-workspace-results">
        {searchScope === "sources" && !configuration.filter.query && !view.path ? (
          <ContinueReading sources={allSources} onOpen={onOpenSource} />
        ) : null}
        {searchScope !== "sources" ? (
          <LibraryTextSearch
            key={searchScope}
            scope={searchScope}
            query={contentQuery}
            sources={sources}
            gateway={gateway}
            surfaces={surfaces}
            onOpen={(id, view) =>
              onOpenSourceView ? onOpenSourceView(id, view) : onOpenSource(id)
            }
          />
        ) : sources.length === 0 && !loading ? (
          <div className="library-workspace-empty">
            <LibraryIcon />
            {allSources.length === 0 ? (
              <>
                <strong>Your library is empty</strong>
                <span>Add a PDF, EPUB or web page to start reading.</span>
                <button type="button" onClick={onAddSource}>
                  Add a source
                </button>
              </>
            ) : (
              <>
                <strong>No sources match</strong>
                <span>Try a different search, or clear the filters.</span>
                {filterCount > 0 || configuration.filter.query ? (
                  <button
                    type="button"
                    onClick={() =>
                      updateFilter({ query: "", status: "all", format: "all", tag: "" })
                    }
                  >
                    Clear search and filters
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : configuration.presentation === "table" ? (
          <LibraryTable
            sources={pageSources}
            columns={visibleColumns(configuration.columns, pageSources)}
            focused={focused}
            onPreview={onPreviewSource}
            onOpen={onOpenSource}
            onOpenBeside={onOpenBeside}
            {...(changeStatus ? { onChangeStatus: changeStatus } : {})}
          />
        ) : (
          <LibraryCards sources={pageSources} onPreview={onPreviewSource} onOpen={onOpenSource} />
        )}
      </div>

      {searchScope === "sources" && pageCount > 1 ? (
        <nav className="library-pagination" aria-label="Library result pages">
          <button
            type="button"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          <span role="status">
            Page {currentPage + 1} of {pageCount} · {sources.length} sources
          </span>
          <button
            type="button"
            disabled={currentPage + 1 === pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
      {saving ? (
        <div
          className="library-save-dialog-backdrop"
          role="button"
          tabIndex={-1}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSaving(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setSaving(false);
            }
          }}
        >
          <form
            className="library-save-dialog"
            aria-label="Save library view"
            onSubmit={(event) => {
              event.preventDefault();
              void save(false);
            }}
          >
            <h2>Save as a new view</h2>
            <p>The filters, sort, columns and layout are saved in your collection.</p>
            <label>
              <span>Name</span>
              <input
                value={saveName}
                placeholder="e.g. Reading this month"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog exists only to take this name.
                autoFocus
                onChange={(event) => setSaveName(event.target.value)}
              />
            </label>
            <div>
              <button type="button" onClick={() => setSaving(false)}>
                Cancel
              </button>
              <button type="submit" disabled={!saveName.trim() || controller.saving}>
                {controller.saving ? "Saving…" : "Save view"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function LibraryTable({
  sources,
  columns,
  focused,
  onPreview,
  onOpen,
  onOpenBeside,
  onChangeStatus,
}: {
  readonly onChangeStatus?: (id: SourceId, status: ReadingStatus) => void;
  readonly sources: readonly SourceSummary[];
  readonly columns: readonly LibraryColumn[];
  readonly focused: boolean;
  readonly onPreview: (id: SourceId) => void;
  readonly onOpen: (id: SourceId) => void;
  readonly onOpenBeside: (id: SourceId) => void;
}): JSX.Element {
  const gridTemplateColumns = columns.map(columnWidth).join(" ");
  return (
    <div
      className="library-table"
      role="grid"
      aria-label="Sources"
      aria-rowcount={sources.length + 1}
    >
      <div className="library-table-row is-header" role="row" style={{ gridTemplateColumns }}>
        {columns.map((column) => (
          <span key={column} role="columnheader" className={`is-${column}`}>
            {columnLabel(column)}
          </span>
        ))}
      </div>
      <div className="library-table-body">
        {sources.map((source) => (
          <div
            key={source.id}
            className="library-table-row"
            role="row"
            tabIndex={focused ? 0 : -1}
            title="Double-click or press Enter to open"
            style={{ gridTemplateColumns }}
            onClick={() => onPreview(source.id)}
            onDoubleClick={() => onOpen(source.id)}
            onKeyDown={(event) => rowKeyDown(event, source.id, onOpen, onOpenBeside)}
          >
            {columns.map((column) => (
              <span key={column} role="gridcell" className={`is-${column}`}>
                {column === "status" && onChangeStatus ? (
                  <StatusPicker source={source} onChange={onChangeStatus} />
                ) : (
                  <TableValue source={source} column={column} />
                )}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function LibraryCards({
  sources,
  onPreview,
  onOpen,
}: {
  readonly sources: readonly SourceSummary[];
  readonly onPreview: (id: SourceId) => void;
  readonly onOpen: (id: SourceId) => void;
}): JSX.Element {
  return (
    <div className="library-card-grid" role="list">
      {sources.map((source) => (
        <article key={source.id} className="library-card" role="listitem">
          <button
            type="button"
            className="library-card-hit-target"
            aria-label={`Preview ${source.title}`}
            onClick={() => onPreview(source.id)}
            onDoubleClick={() => onOpen(source.id)}
          />
          <div className={`library-card-bookplate is-${sourceFormat(source)}`}>
            <span>{formatLabel(source)}</span>
            <strong aria-hidden="true">{source.title.trim().charAt(0).toLocaleUpperCase()}</strong>
          </div>
          <div className="library-card-copy">
            <span>{source.creators.join(", ") || "Unknown creator"}</span>
            <h3>{source.title}</h3>
            <div>
              <small>{publicationDateLabel(source.published) ?? "Undated"}</small>
              <ReadingStatus source={source} />
            </div>
            {source.tags.length > 0 ? (
              <p>{source.tags.slice(0, 3).map(String).join(" · ")}</p>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function TableValue({
  source,
  column,
}: {
  readonly source: SourceSummary;
  readonly column: LibraryColumn;
}): JSX.Element {
  switch (column) {
    case "title":
      return (
        <>
          <span className="source-format-tag">{formatLabel(source)}</span>
          <span className="library-title-copy">
            <strong>{source.title}</strong>
            <small>{source.creators.join(", ") || "Unknown creator"}</small>
          </span>
        </>
      );
    case "creator":
      return <>{source.creators.join(", ") || "—"}</>;
    case "published":
      return <>{publicationDateLabel(source.published) ?? "—"}</>;
    case "status":
      return <ReadingStatus source={source} />;
    case "format":
      return <>{formatLabel(source)}</>;
    case "tags":
      return <>{source.tags.map(String).join(", ") || "—"}</>;
  }
}

function ReadingStatus({ source }: { readonly source: SourceSummary }): JSX.Element {
  const progress = readingProgress(source);
  return (
    <span className={`library-status is-${readingStatusOf(source)}`}>
      {statusLabel(source)}
      {progress !== null ? (
        <span className="library-progress" aria-label={`${String(progress)}% read`}>
          <i style={{ width: `${String(progress)}%` }} />
        </span>
      ) : null}
    </span>
  );
}

const readingStatusChoices: readonly ReadingStatus[] = [
  "inbox",
  "queued",
  "reading",
  "finished",
  "archived",
  "abandoned",
];

function StatusPicker({
  source,
  onChange,
}: {
  readonly source: SourceSummary;
  readonly onChange: (id: SourceId, status: ReadingStatus) => void;
}): JSX.Element {
  const progress = readingProgress(source);
  const status = readingStatusOf(source);
  return (
    <span className={`library-status is-${status} is-editable`}>
      <select
        aria-label={`Reading status of ${source.title}`}
        value={status}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onChange={(event) => onChange(source.id, event.target.value as ReadingStatus)}
      >
        {readingStatusChoices.map((choice) => (
          <option key={choice} value={choice}>
            {choice.charAt(0).toLocaleUpperCase() + choice.slice(1)}
          </option>
        ))}
      </select>
      {progress !== null ? (
        <span className="library-progress" aria-label={`${String(progress)}% read`}>
          <i style={{ width: `${String(progress)}%` }} />
        </span>
      ) : null}
    </span>
  );
}

function readingStatusOf(source: SourceSummary): string {
  return source.reading?.status ?? source.readingStatus ?? "inbox";
}

function statusLabel(source: SourceSummary): string {
  const status = readingStatusOf(source);
  return status.charAt(0).toLocaleUpperCase() + status.slice(1);
}

function readingProgress(source: SourceSummary): number | null {
  const progress = source.reading?.progress;
  if (progress === undefined || readingStatusOf(source) !== "reading") {
    return null;
  }
  return Math.round(Math.max(0, Math.min(1, progress)) * 100);
}

function formatLabel(source: SourceSummary): string {
  const format = sourceFormat(source);
  return format === "web" ? "Web" : format === "note" ? "Note" : format.toLocaleUpperCase();
}

/** Hide optional columns that have nothing to show for any visible source. */
export function visibleColumns(
  columns: readonly LibraryColumn[],
  sources: readonly SourceSummary[],
): readonly LibraryColumn[] {
  const hasValue: Record<LibraryColumn, (source: SourceSummary) => boolean> = {
    title: () => true,
    creator: (source) => source.creators.length > 0,
    published: (source) => publicationDateLabel(source.published) !== null,
    status: () => true,
    format: () => true,
    tags: (source) => source.tags.length > 0,
  };
  return columns.filter(
    (column) => column === "title" || sources.some((source) => hasValue[column](source)),
  );
}

const allColumns: readonly LibraryColumn[] = [
  "title",
  "creator",
  "published",
  "status",
  "format",
  "tags",
];

function columnWidth(column: LibraryColumn): string {
  return {
    title: "minmax(220px, 1fr)",
    creator: "minmax(120px, 0.35fr)",
    published: "84px",
    status: "120px",
    format: "72px",
    tags: "minmax(120px, 0.3fr)",
  }[column];
}

function toggleColumn(
  columns: readonly LibraryColumn[],
  column: LibraryColumn,
): readonly LibraryColumn[] {
  if (column === "title") {
    return columns;
  }
  return columns.includes(column)
    ? columns.filter((candidate) => candidate !== column)
    : [...columns, column];
}

function rowKeyDown(
  event: KeyboardEvent,
  id: SourceId,
  open: (id: SourceId) => void,
  openBeside: (id: SourceId) => void,
): void {
  if (event.target !== event.currentTarget) {
    return;
  }
  const step = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 }[event.key];
  if (step !== undefined && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const row = event.currentTarget;
    const next = step > 0 ? row.nextElementSibling : row.previousElementSibling;
    if (next instanceof HTMLElement) {
      event.preventDefault();
      next.focus();
    }
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    if (event.metaKey || event.ctrlKey) {
      openBeside(id);
    } else {
      open(id);
    }
  }
}

function countLabel(count: number, noun: string): string {
  return `${count.toLocaleString()} ${count === 1 ? noun : `${noun}s`}`;
}

function activeFilterCount(configuration: LibraryViewConfiguration): number {
  return (
    Number(configuration.filter.status !== "all") +
    Number(configuration.filter.format !== "all") +
    Number(Boolean(configuration.filter.tag.trim()))
  );
}

function sameConfiguration(
  left: LibraryViewConfiguration,
  right: LibraryViewConfiguration,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

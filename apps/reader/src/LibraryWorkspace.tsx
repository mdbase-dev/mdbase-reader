/* eslint-disable complexity, max-lines, max-lines-per-function */
import { useEffect, useId, useMemo, useState, type JSX, type KeyboardEvent } from "react";

import { ContinueReading } from "./ContinueReading.js";
import { readerErrorMessage } from "./errors.js";
import { LibraryIcon, MoreIcon, PlusIcon, SearchIcon } from "./icons.js";
import { publicationDateLabel } from "./library-publication-date.js";
import { LibraryTextSearch, type LibrarySearchScope } from "./LibraryTextSearch.js";
import {
  applyLibraryViewConfiguration,
  columnLabel,
  sourceFormat,
  type LibraryColumn,
  type LibraryPresentation,
  type LibraryViewConfiguration,
  type MdbaseLibraryView,
} from "./mdbase-library-views.js";

import type { MdbaseLibraryViewsController } from "./use-mdbase-library-views.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SourceId, SourceSummary } from "@mdbase-reader/core";
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
}: {
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
  const [selected, setSelected] = useState<ReadonlySet<SourceId>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState(view.name);
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
  const baseSources = dirty ? allSources : executedSources;
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
        <div className="library-view-identity">
          <LibraryIcon />
          <label>
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
          </label>
        </div>
        <label className="library-workspace-search">
          <SearchIcon />
          <span className="sr-only">Search this view</span>
          <input
            value={searchScope === "sources" ? configuration.filter.query : contentQuery}
            placeholder={searchScope === "sources" ? "Title, author or tag" : "Find a passage"}
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
          <option value="notes">Notes & annotations</option>
          <option value="documents">Loaded documents</option>
        </select>
        {searchScope === "sources" ? (
          <span className="library-result-count" role="status">
            {loading
              ? "Loading view…"
              : `${String(sources.length)} ${sources.length === 1 ? "source" : "sources"}`}
          </span>
        ) : null}
        <div className="library-save-actions">
          {dirty && view.owned && view.writable ? (
            <button type="button" disabled={controller.saving} onClick={() => void save(true)}>
              Save
            </button>
          ) : null}
        </div>
        <details className="library-workspace-more">
          <summary
            aria-label={`View options${activeFilterCount(configuration) ? `, ${String(activeFilterCount(configuration))} active filters` : ""}`}
            title="View options"
          >
            <MoreIcon />
          </summary>
          <div>
            <strong>Filters</strong>
            <div className="library-filter-panel is-inline">
              <label>
                <span>Reading status</span>
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
                  placeholder="Exact tag"
                  onChange={(event) => updateFilter({ tag: event.target.value })}
                />
              </label>
              {activeFilterCount(configuration) > 0 ? (
                <button
                  type="button"
                  onClick={() => updateFilter({ query: "", status: "all", format: "all", tag: "" })}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
            <strong>Sort</strong>
            <label className="library-sort-control">
              <select
                aria-label="Sort field"
                value={configuration.sortField}
                onChange={(event) =>
                  update({ sortField: event.target.value as LibraryViewConfiguration["sortField"] })
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
                onClick={() =>
                  update({ sortDirection: configuration.sortDirection === "asc" ? "desc" : "asc" })
                }
              >
                {configuration.sortDirection === "asc" ? "↑" : "↓"}
              </button>
            </label>
            <i />
            <strong>Layout</strong>
            <div className="library-presentation-toggle" aria-label="Library presentation">
              {(["table", "cards"] as const).map((presentation) => (
                <button
                  key={presentation}
                  type="button"
                  aria-pressed={configuration.presentation === presentation}
                  onClick={() => update({ presentation })}
                >
                  <PresentationGlyph presentation={presentation} />
                  {presentation === "table" ? "Table" : "Cards"}
                </button>
              ))}
            </div>
            {configuration.presentation === "table" ? (
              <>
                <strong>Columns</strong>
                <div className="library-column-panel">
                  {allColumns.map((column) => (
                    <label key={column}>
                      <input
                        type="checkbox"
                        checked={configuration.columns.includes(column)}
                        disabled={column === "title"}
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
            <i />
            <button type="button" onClick={() => setSaving(true)}>
              Save as view…
            </button>
          </div>
        </details>
        <button
          className="library-add-button"
          type="button"
          aria-label="Add source"
          title="Add source"
          onClick={onAddSource}
        >
          <PlusIcon />
        </button>
      </header>

      {(problem ?? controller.problem) ? (
        <div className="library-view-problem" role="alert">
          {problem ?? controller.problem}
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="library-selection-bar">
          <strong>{selected.size} selected</strong>
          <button type="button" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
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
            <strong>No sources match this view</strong>
            <span>Adjust the filters, or add something new to the collection.</span>
          </div>
        ) : configuration.presentation === "table" ? (
          <LibraryTable
            sources={pageSources}
            columns={configuration.columns}
            selected={selected}
            focused={focused}
            onSelected={setSelected}
            onPreview={onPreviewSource}
            onOpen={onOpenSource}
            onOpenBeside={onOpenBeside}
          />
        ) : (
          <LibraryCards
            sources={pageSources}
            selected={selected}
            onSelected={setSelected}
            onPreview={onPreviewSource}
            onOpen={onOpenSource}
          />
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
            <span className="mono">MDBASE VIEW</span>
            <h2>Save this library view</h2>
            <p>Filters, sorting, columns and presentation will travel with the collection.</p>
            <label>
              <span>View name</span>
              <input value={saveName} onChange={(event) => setSaveName(event.target.value)} />
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
  selected,
  focused,
  onSelected,
  onPreview,
  onOpen,
  onOpenBeside,
}: {
  readonly sources: readonly SourceSummary[];
  readonly columns: readonly LibraryColumn[];
  readonly selected: ReadonlySet<SourceId>;
  readonly focused: boolean;
  readonly onSelected: (selected: ReadonlySet<SourceId>) => void;
  readonly onPreview: (id: SourceId) => void;
  readonly onOpen: (id: SourceId) => void;
  readonly onOpenBeside: (id: SourceId) => void;
}): JSX.Element {
  const gridTemplateColumns = `42px ${columns.map(columnWidth).join(" ")}`;
  return (
    <div
      className="library-table"
      role="grid"
      aria-label="Sources"
      aria-rowcount={sources.length + 1}
    >
      <div className="library-table-row is-header" role="row" style={{ gridTemplateColumns }}>
        <span role="columnheader" aria-label="Select all">
          <input
            type="checkbox"
            checked={sources.length > 0 && sources.every(({ id }) => selected.has(id))}
            onChange={(event) =>
              onSelected(event.target.checked ? new Set(sources.map(({ id }) => id)) : new Set())
            }
          />
        </span>
        {columns.map((column) => (
          <span key={column} role="columnheader">
            {columnLabel(column)}
          </span>
        ))}
      </div>
      <div className="library-table-body">
        {sources.map((source) => (
          <div
            key={source.id}
            className={`library-table-row${selected.has(source.id) ? " is-selected" : ""}`}
            role="row"
            tabIndex={focused ? 0 : -1}
            style={{ gridTemplateColumns }}
            onClick={() => onPreview(source.id)}
            onDoubleClick={() => onOpen(source.id)}
            onKeyDown={(event) => rowKeyDown(event, source.id, onOpen, onOpenBeside)}
          >
            <span role="gridcell">
              <input
                type="checkbox"
                aria-label={`Select ${source.title}`}
                checked={selected.has(source.id)}
                onClick={(event) => event.stopPropagation()}
                onChange={() => onSelected(toggleSelection(selected, source.id))}
              />
            </span>
            {columns.map((column) => (
              <span key={column} role="gridcell" className={`is-${column}`}>
                <TableValue source={source} column={column} />
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
  selected,
  onSelected,
  onPreview,
  onOpen,
}: {
  readonly sources: readonly SourceSummary[];
  readonly selected: ReadonlySet<SourceId>;
  readonly onSelected: (selected: ReadonlySet<SourceId>) => void;
  readonly onPreview: (id: SourceId) => void;
  readonly onOpen: (id: SourceId) => void;
}): JSX.Element {
  return (
    <div className="library-card-grid" role="list">
      {sources.map((source, index) => (
        <article
          key={source.id}
          className={`library-card${selected.has(source.id) ? " is-selected" : ""}`}
        >
          <button
            type="button"
            className="library-card-hit-target"
            aria-label={`Preview ${source.title}`}
            onClick={() => onPreview(source.id)}
            onDoubleClick={() => onOpen(source.id)}
          />
          <label className="library-card-select">
            <span className="sr-only">Select {source.title}</span>
            <input
              type="checkbox"
              checked={selected.has(source.id)}
              onChange={() => onSelected(toggleSelection(selected, source.id))}
            />
          </label>
          <div className={`library-card-bookplate is-${sourceFormat(source)}`}>
            <span>{sourceFormat(source).toLocaleUpperCase()}</span>
            <strong>{String(index + 1).padStart(2, "0")}</strong>
            <i />
          </div>
          <div className="library-card-copy">
            <span>{source.creators.join(", ") || "Unknown creator"}</span>
            <h3>{source.title}</h3>
            <div>
              <small>{publicationDateLabel(source.published) ?? "Undated"}</small>
              <small>{source.readingStatus ?? "inbox"}</small>
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
          <i className={`source-format-dot is-${sourceFormat(source)}`} />
          <strong>{source.title}</strong>
        </>
      );
    case "creator":
      return <>{source.creators.join(", ") || "—"}</>;
    case "published":
      return <>{publicationDateLabel(source.published) ?? "—"}</>;
    case "status":
      return (
        <span className={`library-status is-${source.readingStatus ?? "inbox"}`}>
          {source.readingStatus ?? "inbox"}
        </span>
      );
    case "format":
      return <span className="mono">{sourceFormat(source).toLocaleUpperCase()}</span>;
    case "tags":
      return <>{source.tags.map(String).join(", ") || "—"}</>;
  }
}

function PresentationGlyph({
  presentation,
}: {
  readonly presentation: LibraryPresentation;
}): JSX.Element {
  return presentation === "table" ? (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 3.5h12M2 8h12M2 12.5h12M5 3.5v9" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" />
      <rect x="9" y="2" width="5" height="5" />
      <rect x="2" y="9" width="5" height="5" />
      <rect x="9" y="9" width="5" height="5" />
    </svg>
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
    creator: "140px",
    published: "90px",
    status: "112px",
    format: "82px",
    tags: "220px",
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

function toggleSelection(selected: ReadonlySet<SourceId>, id: SourceId): ReadonlySet<SourceId> {
  const next = new Set(selected);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
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
  if (event.key === "Enter") {
    event.preventDefault();
    if (event.metaKey || event.ctrlKey) {
      openBeside(id);
    } else {
      open(id);
    }
  }
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

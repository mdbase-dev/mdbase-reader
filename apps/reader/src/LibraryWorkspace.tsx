/* eslint-disable complexity, max-lines, max-lines-per-function */
import { useEffect, useMemo, useState, type JSX, type KeyboardEvent } from "react";

import { readerErrorMessage } from "./errors.js";
import { LibraryIcon, PlusIcon, SearchIcon } from "./icons.js";
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
}: {
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
  const [executedSources, setExecutedSources] = useState<readonly SourceSummary[]>(allSources);
  const [loading, setLoading] = useState(Boolean(view.path));
  const [problem, setProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<SourceId>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState(view.name);

  useEffect(() => {
    let active = true;
    void gateway
      .executeLibraryView(view)
      .then((result) => {
        if (active) {
          setExecutedSources(result.sources);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setProblem(readerErrorMessage(reason, "Reader could not execute this mdbase view."));
          setExecutedSources(allSources);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [allSources, gateway, view]);

  const dirty = !sameConfiguration(configuration, view.configuration);
  const baseSources = dirty ? allSources : executedSources;
  const sources = useMemo(
    () => applyLibraryViewConfiguration(baseSources, configuration),
    [baseSources, configuration],
  );
  const update = (value: Partial<LibraryViewConfiguration>): void =>
    setConfiguration((current) => ({ ...current, ...value }));
  const updateFilter = (value: Partial<LibraryViewConfiguration["filter"]>): void =>
    setConfiguration((current) => ({
      ...current,
      filter: { ...current.filter, ...value },
    }));

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
          <span>{view.path ? "mdbase view" : "working view"}</span>
        </div>
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
        <button className="library-add-button" type="button" onClick={onAddSource}>
          <PlusIcon /> Add source
        </button>
      </header>

      <div className="library-workspace-tools">
        <label className="library-workspace-search">
          <SearchIcon />
          <span className="sr-only">Search this view</span>
          <input
            value={configuration.filter.query}
            placeholder="Search this view"
            onChange={(event) => updateFilter({ query: event.target.value })}
          />
        </label>
        <details className="library-workspace-popover">
          <summary>
            Filter
            {activeFilterCount(configuration)
              ? ` · ${String(activeFilterCount(configuration))}`
              : ""}
          </summary>
          <div className="library-filter-panel">
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
            <button
              type="button"
              onClick={() => updateFilter({ query: "", status: "all", format: "all", tag: "" })}
            >
              Clear filters
            </button>
          </div>
        </details>
        <label className="library-sort-control">
          <span>Sort</span>
          <select
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
        {configuration.presentation === "table" ? (
          <details className="library-workspace-popover is-columns">
            <summary>Columns</summary>
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
          </details>
        ) : null}
        <span className="library-result-count" role="status">
          {loading
            ? "Loading view…"
            : `${String(sources.length)} ${sources.length === 1 ? "source" : "sources"}`}
        </span>
        <div className="library-save-actions">
          {dirty && view.owned && view.writable ? (
            <button type="button" disabled={controller.saving} onClick={() => void save(true)}>
              Save changes
            </button>
          ) : null}
          <button type="button" onClick={() => setSaving(true)}>
            Save as view…
          </button>
        </div>
      </div>

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
        {sources.length === 0 && !loading ? (
          <div className="library-workspace-empty">
            <LibraryIcon />
            <strong>No sources match this view</strong>
            <span>Adjust the filters, or add something new to the collection.</span>
          </div>
        ) : configuration.presentation === "table" ? (
          <LibraryTable
            sources={sources}
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
            sources={sources}
            selected={selected}
            onSelected={setSelected}
            onPreview={onPreviewSource}
            onOpen={onOpenSource}
          />
        )}
      </div>

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
              <small>{String(source.published ?? "Undated")}</small>
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
      return <>{source.published ?? "—"}</>;
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
    title: "minmax(240px, 2.2fr)",
    creator: "minmax(150px, 1.2fr)",
    published: "100px",
    status: "112px",
    format: "82px",
    tags: "minmax(150px, 1fr)",
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

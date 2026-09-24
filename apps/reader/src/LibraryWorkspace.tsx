/* eslint-disable complexity, max-lines, max-lines-per-function */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";

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
import { discoverPropertyKeys } from "./library-columns.js";
import {
  emptyRowSelection,
  pruneRowSelection,
  type RowSelection,
} from "./library-row-selection.js";
import { LibraryBulkBar, type BulkStatusProgress } from "./LibraryBulkBar.js";
import { LibraryCards } from "./LibraryCards.js";
import { countLabel } from "./LibraryCells.js";
import { LibraryTable } from "./LibraryTable.js";
import { LibraryTextSearch, type LibrarySearchScope } from "./LibraryTextSearch.js";
import {
  applyLibraryViewConfiguration,
  type LibraryViewConfiguration,
  type MdbaseLibraryView,
} from "./mdbase-library-views.js";
import { Menu } from "./Menu.js";
import { layoutOf, useLibraryLayoutDraft } from "./use-library-layout-draft.js";

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
  onOpenSource,
  onOpenBeside,
  onAddSource,
  onOpenSourceView,
  surfaces,
  bibliographyExport,
  onSourceChanged,
  annotationCounts = noCounts,
}: {
  readonly annotationCounts?: ReadonlyMap<SourceId, number>;
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
  readonly onOpenSource: (sourceId: SourceId) => void;
  readonly onOpenBeside: (sourceId: SourceId) => void;
  readonly onAddSource: () => void;
}): JSX.Element {
  const collectionKey = allSources[0]?.collectionId ?? "library";
  const [layout, setLayout] = useLibraryLayoutDraft(collectionKey, view);
  const [filter, setFilter] = useState(view.configuration.filter);
  const configuration = useMemo<LibraryViewConfiguration>(
    () => ({ ...layout, filter }),
    [layout, filter],
  );
  const [searchScope, setSearchScope] = useState<LibrarySearchScope>("sources");
  const [contentQuery, setContentQuery] = useState("");
  const [selection, setSelection] = useState<RowSelection>(emptyRowSelection);
  // Remounts the table after a reset, since it reads column widths from the layout once.
  const [layoutResets, setLayoutResets] = useState(0);
  const [executedSources, setExecutedSources] = useState<readonly SourceSummary[]>(allSources);
  const [valuesByPath, setValuesByPath] = useState<
    ReadonlyMap<string, Readonly<Record<string, unknown>>>
  >(() => new Map());
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
          setValuesByPath(result.valuesByPath);
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
  // A changed filter searches the whole library; layout changes keep the view's own results.
  const filterChanged = JSON.stringify(filter) !== JSON.stringify(view.configuration.filter);
  const baseSources = filterChanged ? allSources : freshSources;
  const { sortField, sortDirection } = layout;
  const sources = useMemo(
    () =>
      applyLibraryViewConfiguration(baseSources, {
        ...view.configuration,
        sortField,
        sortDirection,
        filter: searchScope === "sources" ? filter : { ...filter, query: "" },
      }),
    [baseSources, filter, searchScope, sortDirection, sortField, view.configuration],
  );
  const visibleSelection = useMemo(
    () =>
      pruneRowSelection(
        selection,
        sources.map(({ id }) => id),
      ),
    [selection, sources],
  );
  const selectedSources = useMemo(
    () => sources.filter(({ id }) => visibleSelection.ids.has(id)),
    [sources, visibleSelection],
  );
  const propertyKeys = useMemo(
    () => discoverPropertyKeys(allSources, view.properties),
    [allSources, view.properties],
  );
  const update = (value: Partial<LibraryViewConfiguration>): void => {
    setLayout({ ...layout, ...value });
  };
  const updateFilter = (value: Partial<LibraryViewConfiguration["filter"]>): void => {
    setFilter((current) => ({ ...current, ...value }));
  };
  const setStatuses = useBulkStatus(gateway, onSourceChanged);
  const resultsRef = useRef<HTMLDivElement>(null);
  const restoredScroll = useRef(false);
  useLayoutEffect(() => {
    // Returning to a view keeps its place once its rows exist to scroll to.
    if (!restoredScroll.current && !loading && resultsRef.current) {
      restoredScroll.current = true;
      resultsRef.current.scrollTop = scrollPositions.get(view.key) ?? 0;
    }
  }, [loading, view.key]);

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
                  ? "Title, author or tag"
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
          <span className="library-search-scope-label" aria-hidden="true">
            in
          </span>
          <select
            aria-label="Search scope"
            className="library-search-scope"
            value={searchScope}
            onChange={(event) => {
              setSearchScope(event.target.value as LibrarySearchScope);
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
                  <option value="opened">Recently opened</option>
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
            </div>
            <hr />
            <button
              type="button"
              disabled={JSON.stringify(layout) === JSON.stringify(layoutOf(view.configuration))}
              onClick={() => {
                setLayout(layoutOf(view.configuration));
                setLayoutResets((count) => count + 1);
              }}
            >
              Reset columns and layout
            </button>
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

      <div
        ref={resultsRef}
        className="library-workspace-results"
        onScroll={(event) => scrollPositions.set(view.key, event.currentTarget.scrollTop)}
      >
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
            key={layoutResets}
            sources={sources}
            layout={layout}
            onLayoutChange={setLayout}
            properties={view.properties}
            propertyKeys={propertyKeys}
            valuesByPath={valuesByPath}
            annotationCounts={annotationCounts}
            focused={focused}
            selection={visibleSelection}
            onSelectionChange={setSelection}
            scrollRef={resultsRef}
            onOpen={onOpenSource}
            onOpenBeside={onOpenBeside}
            {...(changeStatus ? { onChangeStatus: changeStatus } : {})}
          />
        ) : (
          <LibraryCards
            sources={sources}
            selection={visibleSelection}
            onSelectionChange={setSelection}
            onOpen={onOpenSource}
            scrollRef={resultsRef}
          />
        )}
      </div>

      {selectedSources.length > 1 || (visibleSelection.touch && selectedSources.length > 0) ? (
        <LibraryBulkBar
          selected={selectedSources}
          onClear={() => setSelection(emptyRowSelection)}
          {...(setStatuses ? { onSetStatus: setStatuses } : {})}
          onOpen={(chosen) => {
            for (const source of chosen) {
              onOpenSource(source.id);
            }
          }}
          onExport={bibliographyExport.runFor}
        />
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

const noCounts: ReadonlyMap<SourceId, number> = new Map();
// Scroll positions outlive a tab's renderer, so a view keeps its place across tab switches.
const scrollPositions = new Map<string, number>();

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

type BulkStatusSetter = (
  sources: readonly SourceSummary[],
  status: ReadingStatus,
  progress: (value: BulkStatusProgress) => void,
) => Promise<void>;

/** Writes one reading status to many sources, a few at a time, reporting progress. */
function useBulkStatus(
  gateway: ReaderWorkspaceGateway,
  onSourceChanged: ((source: Source) => void) | undefined,
): BulkStatusSetter | undefined {
  const save = gateway.saveReadingStatus?.bind(gateway);
  const run = useCallback<BulkStatusSetter>(
    async (sources, status, progress) => {
      if (!save) {
        return;
      }
      let done = 0;
      let failed = 0;
      const queue = [...sources];
      const worker = async (): Promise<void> => {
        for (let source = queue.shift(); source; source = queue.shift()) {
          try {
            onSourceChanged?.(await save(source.id, status));
          } catch {
            failed += 1;
          }
          done += 1;
          progress({ done, total: sources.length, failed });
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, sources.length) }, worker));
    },
    [onSourceChanged, save],
  );
  return save ? run : undefined;
}

/* eslint-disable complexity, max-lines-per-function */
import { Select, type SelectItems, type SelectOption } from "@mdbase-dev/ui/select";
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
  DownloadIcon,
  FilterIcon,
  ImportIcon,
  LibraryIcon,
  PlusIcon,
  SearchIcon,
} from "./icons.js";
import { importHref } from "./import-navigation.js";
import {
  columnLabel,
  discoverPropertyKeys,
  propertyColumn,
  propertyKey,
} from "./library-columns.js";
import { fieldShape, isActiveCondition } from "./library-conditions.js";
import {
  emptyRowSelection,
  pruneRowSelection,
  type RowSelection,
} from "./library-row-selection.js";
import { LibraryAnnotations } from "./LibraryAnnotations.js";
import { LibraryBulkBar } from "./LibraryBulkBar.js";
import { LibraryCards } from "./LibraryCards.js";
import { countLabel, readingStatusChoices, readingStatusLabel } from "./LibraryCells.js";
import { LibraryConditionsEditor } from "./LibraryConditionsEditor.js";
import { LibraryTable } from "./LibraryTable.js";
import { LibraryTextSearch, type LibrarySearchScope } from "./LibraryTextSearch.js";
import { LibraryViewSaveDialog } from "./LibraryViewSaveDialog.js";
import {
  applyLibraryViewConfiguration,
  type LibraryViewConfiguration,
  type MdbaseLibraryView,
} from "./mdbase-library-views.js";
import { Menu } from "./Menu.js";
import { useInspectedLibraryRow } from "./use-inspected-library-row.js";
import { layoutOf, useLibraryLayoutDraft } from "./use-library-layout-draft.js";
import { useLibraryWrites } from "./use-library-writes.js";

import type { BibliographyExportController } from "./use-bibliography-export.js";
import type { MdbaseLibraryViewsController } from "./use-mdbase-library-views.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type {
  Annotation,
  ReadingStatus,
  Source,
  SourceId,
  SourceSummary,
} from "@mdbase-reader/core";
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
  onInspectSource,
  onAddSource,
  onOpenSourceView,
  surfaces,
  bibliographyExport,
  onSourceChanged,
  annotationCounts = noCounts,
  onOpenAnnotation,
}: {
  /** Opens an annotation in its source's document; defaults to opening the source. */
  readonly onOpenAnnotation?: (annotation: Annotation, beside: boolean) => void;
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
  /** Shows a source in the Notes pane when its row is selected. */
  readonly onInspectSource?: (sourceId: SourceId) => void;
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
  // A saved annotations view opens on its annotations; any view can switch between the two.
  const [mode, setMode] = useState<"sources" | "annotations">(
    view.annotations ? "annotations" : "sources",
  );
  const [contentQuery, setContentQuery] = useState("");
  const [selection, setSelection] = useState<RowSelection>(emptyRowSelection);
  // Remounts the table after a reset, since it reads column widths from the layout once.
  const [layoutResets, setLayoutResets] = useState(0);
  const [executedSources, setExecutedSources] = useState<readonly SourceSummary[]>(allSources);
  const [valuesByPath, setValuesByPath] = useState<
    ReadonlyMap<string, Readonly<Record<string, unknown>>>
  >(() => new Map());
  const [loading, setLoading] = useState(Boolean(view.path && !view.annotations));
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
  const executionFamily = `reader-library-view:${useId()}`;

  useEffect(() => {
    // Annotation mode owns its execution and hydration in LibraryAnnotations.
    if (mode !== "sources" || view.annotations) {
      return undefined;
    }
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
  }, [allSources, executionFamily, gateway, mode, view]);

  const dirty = !sameConfiguration(configuration, view.configuration);
  const filterCount = activeFilterCount(configuration);
  // Prefer the library's copy of each source, so edits such as a status change show at once.
  const freshSources = useMemo(() => {
    const byId = new Map(allSources.map((source) => [source.id, source]));
    return executedSources.map((source) => byId.get(source.id) ?? source);
  }, [allSources, executedSources]);
  // A changed filter searches the whole library; layout changes keep the view's own results.
  const filterChanged = JSON.stringify(filter) !== JSON.stringify(view.configuration.filter);
  const baseSources = filterChanged || view.annotations ? allSources : freshSources;
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
  useInspectedLibraryRow(
    useMemo(() => sources.map(({ id }) => id), [sources]),
    visibleSelection,
    focused && mode === "sources",
    onInspectSource,
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
  const shapeOf = useCallback((key: string) => fieldShape(allSources, key), [allSources]);
  const writes = useLibraryWrites(
    gateway,
    (source) => {
      // A saved view's selected values would otherwise mask the edit until it re-runs.
      setValuesByPath((current) => {
        if (!current.has(source.path)) {
          return current;
        }
        const next = new Map(current);
        next.delete(source.path);
        return next;
      });
      onSourceChanged?.(source);
    },
    shapeOf,
  );
  const resultsRef = useRef<HTMLDivElement>(null);
  const restoredScroll = useRef(false);
  useLayoutEffect(() => {
    // Returning to a view keeps its place once its rows exist to scroll to.
    if (!restoredScroll.current && !loading && resultsRef.current) {
      restoredScroll.current = true;
      resultsRef.current.scrollTop = scrollPositions.get(view.key) ?? 0;
    }
  }, [loading, view.key]);

  // Saving over the open view keeps its name; saving as new takes the name from the dialog.
  const save = async (name: string, replace: boolean): Promise<void> => {
    const saved = await controller.save({
      name,
      configuration,
      fieldShapes: Object.fromEntries(
        configuration.filter.conditions.map(({ key }) => [key, fieldShape(allSources, key)]),
      ),
      ...(replace && view.path && view.owned ? { existing: view } : {}),
    });
    setSaving(false);
    onOpenView(saved);
  };

  return (
    <section className="library-workspace" aria-label={`${view.name} library view`}>
      <header className="library-workspace-header">
        <label className="library-view-identity">
          <Select
            aria-label="Library view"
            className="is-quiet"
            value={view.key}
            options={availableViews.map(({ key, name }) => ({ value: key, label: name }))}
            onChange={(key) => {
              const next = availableViews.find((candidate) => candidate.key === key);
              if (next) {
                onOpenView(next);
              }
            }}
          />
        </label>
        <div className="segmented-control library-mode" role="group" aria-label="Show">
          {(["sources", "annotations"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {value === "sources" ? "Sources" : "Annotations"}
            </button>
          ))}
        </div>
        {mode === "sources" ? (
          <>
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
              <Select
                aria-label="Search scope"
                className="library-search-scope is-quiet"
                value={searchScope}
                options={searchScopeOptions}
                onChange={setSearchScope}
              />
            </div>
            <div className="library-header-trailing">
              {searchScope === "sources" ? (
                <span className="library-result-count" role="status">
                  {loading ? "Loading…" : countLabel(sources.length, "source")}
                </span>
              ) : null}
              {dirty && view.owned && view.writable && !view.annotations ? (
                <button
                  className="library-save-button"
                  type="button"
                  disabled={controller.saving}
                  onClick={() => void save(view.name, true)}
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
                    <Select
                      aria-label="Status"
                      value={configuration.filter.status}
                      options={statusFilterOptions}
                      onChange={(status) => updateFilter({ status })}
                    />
                  </label>
                  <label>
                    <span>Format</span>
                    <Select
                      aria-label="Format"
                      value={configuration.filter.format}
                      options={formatFilterOptions}
                      onChange={(format) => updateFilter({ format })}
                    />
                  </label>
                  <label>
                    <span>Tag</span>
                    <input
                      className="mdbase-field"
                      value={configuration.filter.tag}
                      placeholder="Any tag"
                      onChange={(event) => updateFilter({ tag: event.target.value })}
                    />
                  </label>
                  <LibraryConditionsEditor
                    conditions={configuration.filter.conditions}
                    propertyKeys={propertyKeys}
                    sources={allSources}
                    onChange={(conditions) => updateFilter({ conditions })}
                  />
                  {filterCount > 0 ? (
                    <button
                      className="library-clear-filters"
                      type="button"
                      onClick={() =>
                        updateFilter({ status: "all", format: "all", tag: "", conditions: [] })
                      }
                    >
                      Clear filters
                    </button>
                  ) : null}
                  <span className="menu-label">Sort</span>
                  <div className="library-sort-control">
                    <Select
                      aria-label="Sort field"
                      value={configuration.sortField}
                      options={sortOptionsFor(configuration.sortField, view.properties)}
                      onChange={(sortField) => update({ sortField })}
                    />
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
                  <p
                    className={`menu-note${bibliographyExport.status === "error" ? " is-error" : ""}`}
                  >
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
          </>
        ) : null}
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
        {mode === "annotations" ? (
          <LibraryAnnotations
            gateway={gateway}
            view={view}
            controller={controller}
            collectionKey={collectionKey}
            onOpenView={onOpenView}
            sources={allSources}
            propertyKeys={propertyKeys}
            focused={focused}
            scrollRef={resultsRef}
            onOpenAnnotation={
              onOpenAnnotation ?? ((annotation) => onOpenSource(annotation.sourceId))
            }
          />
        ) : (
          <>
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
                          updateFilter({
                            query: "",
                            status: "all",
                            format: "all",
                            tag: "",
                            conditions: [],
                          })
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
                onExport={bibliographyExport.runFor}
                {...(changeStatus ? { onChangeStatus: changeStatus } : {})}
                {...(writes.saveField
                  ? {
                      onEditField: (source: SourceSummary, key: string, text: string) =>
                        writes.saveField?.(source, key, text).catch((reason: unknown) => {
                          setProblem(readerErrorMessage(reason, `Reader could not save ${key}.`));
                          throw reason;
                        }) ?? Promise.resolve(),
                    }
                  : {})}
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
          </>
        )}
      </div>

      {mode === "sources" &&
      (selectedSources.length > 1 || (visibleSelection.touch && selectedSources.length > 0)) ? (
        <LibraryBulkBar
          selected={selectedSources}
          onClear={() => setSelection(emptyRowSelection)}
          {...(writes.setStatuses ? { onSetStatus: writes.setStatuses } : {})}
          {...(writes.setFields ? { onSetField: writes.setFields } : {})}
          propertyKeys={propertyKeys}
          onOpen={(chosen) => {
            for (const source of chosen) {
              onOpenSource(source.id);
            }
          }}
          onExport={bibliographyExport.runFor}
        />
      ) : null}
      {saving ? (
        <LibraryViewSaveDialog
          description="The filters, sort, columns and layout are saved in your collection."
          placeholder="e.g. Reading this month"
          saving={controller.saving}
          onCancel={() => setSaving(false)}
          onSave={(name) => void save(name, false)}
        />
      ) : null}
    </section>
  );
}

const noCounts: ReadonlyMap<SourceId, number> = new Map();

const searchScopeOptions: SelectItems<LibrarySearchScope> = [
  { value: "sources", label: "Library" },
  { value: "notes", label: "Notes & annotations" },
  { value: "documents", label: "Open documents" },
];

const statusFilterOptions: SelectItems<LibraryViewConfiguration["filter"]["status"]> = [
  { value: "all", label: "Any status" },
  ...readingStatusChoices.map((status) => ({ value: status, label: readingStatusLabel(status) })),
];

const formatFilterOptions: SelectItems<LibraryViewConfiguration["filter"]["format"]> = [
  { value: "all", label: "Any format" },
  { value: "pdf", label: "PDF" },
  { value: "epub", label: "EPUB" },
  { value: "web", label: "Saved web page" },
  { value: "note", label: "No file attached" },
];

/** The fixed sort fields, plus a property column when the view is sorted by one. */
function sortOptionsFor(
  current: LibraryViewConfiguration["sortField"],
  properties: Parameters<typeof columnLabel>[1],
): SelectItems<LibraryViewConfiguration["sortField"]> {
  const key = propertyKey(current);
  return key === null
    ? sortFieldOptions
    : [
        ...sortFieldOptions,
        { value: current, label: columnLabel(propertyColumn(key), properties) },
      ];
}

const sortFieldOptions: readonly SelectOption<LibraryViewConfiguration["sortField"]>[] = [
  { value: "saved", label: "Recently saved" },
  { value: "opened", label: "Recently opened" },
  { value: "title", label: "Title" },
  { value: "creator", label: "Creator" },
  { value: "published", label: "Published" },
  { value: "status", label: "Status" },
];
// Scroll positions outlive a tab's renderer, so a view keeps its place across tab switches.
const scrollPositions = new Map<string, number>();

function activeFilterCount(configuration: LibraryViewConfiguration): number {
  return (
    Number(configuration.filter.status !== "all") +
    Number(configuration.filter.format !== "all") +
    Number(Boolean(configuration.filter.tag.trim())) +
    configuration.filter.conditions.filter(isActiveCondition).length
  );
}

function sameConfiguration(
  left: LibraryViewConfiguration,
  right: LibraryViewConfiguration,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

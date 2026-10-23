/* eslint-disable complexity, max-lines-per-function */
import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
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
  indexLoading = false,
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
  onRemoveSource,
}: {
  /** Asks to remove a source; the caller confirms before anything is deleted. */
  readonly onRemoveSource?: (source: SourceSummary) => void;
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
  readonly indexLoading?: boolean;
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
  const { t } = useLingui();
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
            setProblem(
              readerErrorMessage(
                reason,
                translate({ message: "Reader could not change the reading status." }),
              ),
            ),
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
          setProblem(
            readerErrorMessage(
              reason,
              translate({ message: "Reader could not execute this mdbase view." }),
            ),
          );
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
    <section className="library-workspace" aria-label={t`${view.name} library view`}>
      <header className="library-workspace-header">
        <label className="library-view-identity">
          <Select
            aria-label={t({ message: "Library view", context: "LibraryWorkspace interface" })}
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
        <div
          className="segmented-control library-mode"
          role="group"
          aria-label={t({ message: "Show", context: "LibraryWorkspace interface" })}
        >
          {(["sources", "annotations"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {value === "sources"
                ? t({ message: "Sources", context: "LibraryWorkspace interface" })
                : t({ message: "Annotations", context: "LibraryWorkspace interface" })}
            </button>
          ))}
        </div>
        {mode === "sources" ? (
          <>
            <div className="library-workspace-search">
              <SearchIcon />
              <label className="library-search-field">
                <span className="sr-only">{t({ message: "Search this view" })}</span>
                <input
                  value={searchScope === "sources" ? configuration.filter.query : contentQuery}
                  placeholder={
                    searchScope === "sources"
                      ? t({ message: "Title, author or tag" })
                      : searchScope === "notes"
                        ? t({ message: "Search notes and annotations" })
                        : t({ message: "Search open documents" })
                  }
                  onChange={(event) =>
                    searchScope === "sources"
                      ? updateFilter({ query: event.target.value })
                      : setContentQuery(event.target.value)
                  }
                />
              </label>
              <span className="library-search-scope-label" aria-hidden="true">
                <Trans>in</Trans>
              </span>
              <Select
                aria-label={t({ message: "Search scope", context: "LibraryWorkspace interface" })}
                className="library-search-scope is-quiet"
                value={searchScope}
                options={searchScopeOptions()}
                onChange={setSearchScope}
              />
            </div>
            <div className="library-header-trailing">
              {searchScope === "sources" ? (
                <span className="library-result-count" role="status">
                  {loading
                    ? t({ message: "Loading…", context: "LibraryWorkspace interface" })
                    : `${countLabel(sources.length, "source")}${indexLoading && !view.path ? t({ message: " · Loading more…" }) : ""}`}
                </span>
              ) : null}
              {dirty && view.owned && view.writable && !view.annotations ? (
                <button
                  className="library-save-button"
                  type="button"
                  disabled={controller.saving}
                  onClick={() => void save(view.name, true)}
                >
                  <Trans>Save view</Trans>
                </button>
              ) : null}
              <Menu
                className="library-workspace-more"
                label={t`View options${filterCount ? `, ${String(filterCount)} active filters` : ""}`}
                title={t({ message: "View options", context: "LibraryWorkspace interface" })}
                trigger={
                  <>
                    <FilterIcon />
                    {filterCount ? <span className="menu-badge">{filterCount}</span> : null}
                  </>
                }
              >
                <div className="library-options" data-menu-keep-open>
                  <span className="menu-label">
                    <Trans>Filter</Trans>
                  </span>
                  <label>
                    <span>{t({ message: "Status" })}</span>
                    <Select
                      aria-label={t({ message: "Status", context: "LibraryWorkspace interface" })}
                      value={configuration.filter.status}
                      options={statusFilterOptions()}
                      onChange={(status) => updateFilter({ status })}
                    />
                  </label>
                  <label>
                    <span>{t({ message: "Format" })}</span>
                    <Select
                      aria-label={t({ message: "Format", context: "LibraryWorkspace interface" })}
                      value={configuration.filter.format}
                      options={formatFilterOptions()}
                      onChange={(format) => updateFilter({ format })}
                    />
                  </label>
                  <label>
                    <span>{t({ message: "Tag" })}</span>
                    <input
                      className="mdbase-field"
                      value={configuration.filter.tag}
                      placeholder={t({ message: "Any tag", context: "LibraryWorkspace interface" })}
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
                      <Trans>Clear filters</Trans>
                    </button>
                  ) : null}
                  <span className="menu-label">
                    <Trans>Sort</Trans>
                  </span>
                  <div className="library-sort-control">
                    <Select
                      aria-label={t({
                        message: "Sort field",
                        context: "LibraryWorkspace interface",
                      })}
                      value={configuration.sortField}
                      options={sortOptionsFor(configuration.sortField, view.properties)}
                      onChange={(sortField) => update({ sortField })}
                    />
                    <button
                      type="button"
                      aria-label={
                        configuration.sortDirection === "asc"
                          ? t`Sort descending`
                          : t`Sort ascending`
                      }
                      title={
                        configuration.sortDirection === "asc"
                          ? t({ message: "Ascending", context: "LibraryWorkspace interface" })
                          : t({ message: "Descending", context: "LibraryWorkspace interface" })
                      }
                      onClick={() =>
                        update({
                          sortDirection: configuration.sortDirection === "asc" ? "desc" : "asc",
                        })
                      }
                    >
                      {configuration.sortDirection === "asc" ? "↑" : "↓"}
                    </button>
                  </div>
                  <span className="menu-label">
                    <Trans>Layout</Trans>
                  </span>
                  <div
                    className="segmented-control"
                    aria-label={t({
                      message: "Library presentation",
                      context: "LibraryWorkspace interface",
                    })}
                  >
                    {(["table", "cards"] as const).map((presentation) => (
                      <button
                        key={presentation}
                        type="button"
                        aria-pressed={configuration.presentation === presentation}
                        onClick={() => update({ presentation })}
                      >
                        {presentation === "table"
                          ? t({ message: "Table", context: "LibraryWorkspace interface" })
                          : t({ message: "Cards", context: "LibraryWorkspace interface" })}
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
                  <Trans>Reset columns and layout</Trans>
                </button>
                <button type="button" onClick={() => setSaving(true)}>
                  <Trans>Save as new view…</Trans>
                </button>
                <button
                  type="button"
                  disabled={bibliographyExport.status === "exporting"}
                  onClick={bibliographyExport.run}
                >
                  <DownloadIcon />
                  {bibliographyExport.status === "exporting"
                    ? t({
                        message: "Preparing bibliography…",
                        context: "LibraryWorkspace interface",
                      })
                    : t({ message: "Export bibliography", context: "LibraryWorkspace interface" })}
                </button>
                <a href={importHref()} target="_blank" rel="noopener noreferrer">
                  <ImportIcon />
                  <Trans>Import a library…</Trans>
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
                aria-label={t({ message: "Add source", context: "LibraryWorkspace interface" })}
                title={t({ message: "Add source", context: "LibraryWorkspace interface" })}
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
            ) : sources.length === 0 && !loading && !(indexLoading && !view.path) ? (
              <div className="library-workspace-empty">
                <LibraryIcon />
                {allSources.length === 0 ? (
                  <>
                    <strong>
                      <Trans>Your library is empty</Trans>
                    </strong>
                    <span>
                      <Trans>Add a PDF, EPUB or web page to start reading.</Trans>
                    </span>
                    <button type="button" onClick={onAddSource}>
                      <Trans>Add a source</Trans>
                    </button>
                  </>
                ) : (
                  <>
                    <strong>
                      <Trans>No sources match</Trans>
                    </strong>
                    <span>
                      <Trans>Try a different search, or clear the filters.</Trans>
                    </span>
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
                        <Trans>Clear search and filters</Trans>
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
                {...(onRemoveSource ? { onRemove: onRemoveSource } : {})}
                {...(changeStatus ? { onChangeStatus: changeStatus } : {})}
                {...(writes.saveField
                  ? {
                      onEditField: (source: SourceSummary, key: string, text: string) =>
                        writes.saveField?.(source, key, text).catch((reason: unknown) => {
                          setProblem(readerErrorMessage(reason, t`Reader could not save ${key}.`));
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
          description={t({
            message: "The filters, sort, columns and layout are saved in your collection.",
          })}
          placeholder={t({ message: "e.g. Reading this month" })}
          saving={controller.saving}
          onCancel={() => setSaving(false)}
          onSave={(name) => void save(name, false)}
        />
      ) : null}
    </section>
  );
}

const noCounts: ReadonlyMap<SourceId, number> = new Map();

function searchScopeOptions(): SelectItems<LibrarySearchScope> {
  return [
    {
      value: "sources",
      label: translate({ message: "Library", context: "LibraryWorkspace searchScopeOptions" }),
    },
    {
      value: "notes",
      label: translate({
        message: "Notes & annotations",
        context: "LibraryWorkspace searchScopeOptions",
      }),
    },
    {
      value: "documents",
      label: translate({
        message: "Open documents",
        context: "LibraryWorkspace searchScopeOptions",
      }),
    },
  ];
}

function statusFilterOptions(): SelectItems<LibraryViewConfiguration["filter"]["status"]> {
  return [
    {
      value: "all",
      label: translate({ message: "Any status", context: "LibraryWorkspace statusFilterOptions" }),
    },
    ...readingStatusChoices.map((status) => ({ value: status, label: readingStatusLabel(status) })),
  ];
}

function formatFilterOptions(): SelectItems<LibraryViewConfiguration["filter"]["format"]> {
  return [
    {
      value: "all",
      label: translate({ message: "Any format", context: "LibraryWorkspace formatFilterOptions" }),
    },
    {
      value: "pdf",
      label: translate({ message: "PDF", context: "LibraryWorkspace formatFilterOptions" }),
    },
    {
      value: "epub",
      label: translate({ message: "EPUB", context: "LibraryWorkspace formatFilterOptions" }),
    },
    {
      value: "web",
      label: translate({
        message: "Saved web page",
        context: "LibraryWorkspace formatFilterOptions",
      }),
    },
    {
      value: "note",
      label: translate({
        message: "No file attached",
        context: "LibraryWorkspace formatFilterOptions",
      }),
    },
  ];
}

/** The fixed sort fields, plus a property column when the view is sorted by one. */
function sortOptionsFor(
  current: LibraryViewConfiguration["sortField"],
  properties: Parameters<typeof columnLabel>[1],
): SelectItems<LibraryViewConfiguration["sortField"]> {
  const key = propertyKey(current);
  return key === null
    ? sortFieldOptions()
    : [
        ...sortFieldOptions(),
        { value: current, label: columnLabel(propertyColumn(key), properties) },
      ];
}

function sortFieldOptions(): readonly SelectOption<LibraryViewConfiguration["sortField"]>[] {
  return [
    {
      value: "saved",
      label: translate({ message: "Recently saved", context: "LibraryWorkspace sortFieldOptions" }),
    },
    {
      value: "opened",
      label: translate({
        message: "Recently opened",
        context: "LibraryWorkspace sortFieldOptions",
      }),
    },
    {
      value: "title",
      label: translate({ message: "Title", context: "LibraryWorkspace sortFieldOptions" }),
    },
    {
      value: "creator",
      label: translate({ message: "Creator", context: "LibraryWorkspace sortFieldOptions" }),
    },
    {
      value: "published",
      label: translate({ message: "Published", context: "LibraryWorkspace sortFieldOptions" }),
    },
    {
      value: "status",
      label: translate({ message: "Status", context: "LibraryWorkspace sortFieldOptions" }),
    },
  ];
}
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

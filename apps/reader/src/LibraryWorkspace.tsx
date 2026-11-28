/* eslint-disable complexity */
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

import { BrowserExtensionDiscovery } from "./BrowserExtensionHelp.js";
import { CitationQualitySummary } from "./CitationQualitySummary.js";
import { CollectionAnnotations } from "./CollectionAnnotations.js";
import { ContinueReading } from "./ContinueReading.js";
import { readerErrorMessage } from "./errors.js";
import { FilterIcon, MoreIcon, LibraryIcon, PlusIcon, SearchIcon } from "./icons.js";
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
import { librarySourceParts } from "./library-source-parts.js";
import { LibraryBulkBar } from "./LibraryBulkBar.js";
import { countLabel, readingStatusChoices, readingStatusLabel } from "./LibraryCells.js";
import { LibraryConditionsEditor } from "./LibraryConditionsEditor.js";
import { LibraryNoteMatches, useNoteSearch } from "./LibraryNoteMatches.js";
import { LibraryTable } from "./LibraryTable.js";
import { LibraryViewSaveDialog } from "./LibraryViewSaveDialog.js";
import {
  applyLibraryViewConfiguration,
  type LibraryViewConfiguration,
  type MdbaseLibraryView,
} from "./mdbase-library-views.js";
import { Menu } from "./Menu.js";
import { OverlayPresence } from "./OverlayPresence.js";
import { ReaderNotice } from "./ReaderNotice.js";
import { useInspectedLibraryRow } from "./use-inspected-library-row.js";
import { useLibraryFilter } from "./use-library-filter.js";
import { layoutOf, useLibraryLayoutDraft } from "./use-library-layout-draft.js";
import { useLibraryWrites } from "./use-library-writes.js";
import { useRovingControls } from "./use-roving-controls.js";
import "./library.css";

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

export function LibraryWorkspace({
  view,
  availableViews,
  allSources,
  indexLoading = false,
  gateway,
  controller,
  focused,
  syncFilterUrl = false,
  onOpenView,
  onOpenSource,
  onOpenBeside,
  onInspectSource,
  onAddSource,
  onOpenSourceView,
  bibliographyExport,
  onSourceChanged,
  changeStatus,
  annotationCounts = noCounts,
  onOpenAnnotation,
  onRemoveSource,
}: {
  /** Asks to remove a source; the caller confirms before anything is deleted. */
  readonly onRemoveSource?: (source: SourceSummary) => void;
  /** Opens an annotation in its source's document; defaults to opening the source. */
  readonly onOpenAnnotation?: (annotation: Annotation, beside: boolean) => void;
  readonly annotationCounts?: ReadonlyMap<SourceId, number> | null;
  readonly bibliographyExport: BibliographyExportController;
  readonly onSourceChanged?: (source: Source) => void;
  readonly changeStatus?: ((source: SourceSummary, status: ReadingStatus) => void) | undefined;
  readonly onOpenSourceView?: (id: SourceId, view: "document" | "note" | "annotations") => void;
  readonly view: MdbaseLibraryView;
  readonly availableViews: readonly MdbaseLibraryView[];
  readonly allSources: readonly SourceSummary[];
  readonly indexLoading?: boolean;
  readonly gateway: ReaderWorkspaceGateway;
  readonly controller: MdbaseLibraryViewsController;
  readonly focused: boolean;
  readonly syncFilterUrl?: boolean;
  readonly onOpenView: (view: MdbaseLibraryView) => void;
  readonly onOpenSource: (sourceId: SourceId) => void;
  readonly onOpenBeside: (sourceId: SourceId) => void;
  /** Shows a source in the Notes pane when its row is selected. */
  readonly onInspectSource?: (sourceId: SourceId) => void;
  readonly onAddSource: () => void;
}): JSX.Element {
  const { t } = useLingui();
  const trailingControls = useRovingControls();
  const collectionKey = allSources[0]?.collectionId ?? "library";
  const [layout, setLayout] = useLibraryLayoutDraft(collectionKey, view);
  const [filter, setFilter] = useLibraryFilter(view.configuration.filter, syncFilterUrl);
  const configuration = useMemo<LibraryViewConfiguration>(
    () => ({ ...layout, filter }),
    [layout, filter],
  );
  // Any view can switch to the collection's annotations and back.
  const [mode, setMode] = useState<"sources" | "annotations">("sources");
  const [selection, setSelection] = useState<RowSelection>(emptyRowSelection);
  // Remounts the table after a reset, since it reads column widths from the layout once.
  const [layoutResets, setLayoutResets] = useState(0);
  const [executedSources, setExecutedSources] = useState<readonly SourceSummary[]>(allSources);
  const [valuesByPath, setValuesByPath] = useState<
    ReadonlyMap<string, Readonly<Record<string, unknown>>>
  >(() => new Map());
  const [loading, setLoading] = useState(Boolean(view.path));
  const [viewProblem, setViewProblem] = useState<string | null>(null);
  const [editProblem, setEditProblem] = useState<string | null>(null);
  const problem = editProblem ?? (mode === "sources" ? viewProblem : null) ?? controller.problem;
  const [saving, setSaving] = useState(false);
  const executionFamily = `reader-library-view:${useId()}`;

  useEffect(() => {
    if (mode !== "sources") {
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
          setViewProblem(null);
          setExecutedSources(result.sources);
          setValuesByPath(result.valuesByPath);
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setViewProblem(
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
    if (allSources === executedSources) {
      return allSources;
    }
    const byId = new Map(allSources.map((source) => [source.id, source]));
    return executedSources.map((source) => byId.get(source.id) ?? source);
  }, [allSources, executedSources]);
  // A changed filter searches the whole library; layout changes keep the view's own results.
  const filterChanged = JSON.stringify(filter) !== JSON.stringify(view.configuration.filter);
  const baseSources = filterChanged ? allSources : freshSources;
  const { sortField, sortDirection } = layout;
  const matches = useMemo(
    () =>
      applyLibraryViewConfiguration(
        baseSources,
        {
          ...view.configuration,
          sortField,
          sortDirection,
          filter,
        },
        allSources,
      ),
    [baseSources, filter, sortDirection, sortField, view.configuration, allSources],
  );
  // The same search also looks in notes and annotations, among the sources the other filters allow.
  const noteSearch = useNoteSearch(gateway, mode === "sources" ? filter.query : "");
  const noteCandidates = useMemo(
    () =>
      noteSearch.matches.size === 0
        ? []
        : applyLibraryViewConfiguration(
            baseSources.filter(({ id }) => noteSearch.matches.has(id)),
            { ...view.configuration, sortField, sortDirection, filter: { ...filter, query: "" } },
            allSources,
          ),
    [
      allSources,
      baseSources,
      filter,
      noteSearch.matches,
      sortDirection,
      sortField,
      view.configuration,
    ],
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<SourceId>>(() => new Set());
  const [flatParts, setFlatParts] = useState(false);
  const parts = useMemo(
    () =>
      librarySourceParts(
        matches,
        allSources,
        collapsed,
        flatParts || Boolean(filter.query.trim()),
        !indexLoading,
      ),
    [matches, allSources, collapsed, flatParts, filter.query, indexLoading],
  );
  const sources = parts.sources;
  const togglePart = (id: SourceId): void =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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
  // "Export citations" takes the selection, or every source in this view.
  const exportScope = selectedSources.length > 0 ? selectedSources : sources;
  const { setScope: setExportScope } = bibliographyExport;
  useEffect(() => {
    if (!focused || mode !== "sources") {
      return undefined;
    }
    setExportScope(exportScope);
    return () => setExportScope(null);
  }, [exportScope, focused, mode, setExportScope]);
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
  // The table scrolls itself, so `resultsRef` is not always this element.
  const resultsAreaRef = useRef<HTMLDivElement>(null);
  const emptySources = sources.length === 0 && !loading && !(indexLoading && !view.path);
  const rendersSourceTable = mode === "sources" && !emptySources;
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
    <section
      className="library-workspace"
      aria-label={t`${view.name} library view`}
      onFocusCapture={(event) => {
        const row = (event.target as Element).closest<HTMLElement>("[data-row-index]");
        const source = row ? sources[Number(row.dataset["rowIndex"])] : undefined;
        if (source) {
          onInspectSource?.(source.id);
        }
      }}
    >
      <h1 className="sr-only">{view.name}</h1>
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
              tabIndex={mode === value ? 0 : -1}
              aria-pressed={mode === value}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  setMode(mode === "sources" ? "annotations" : "sources");
                  const buttons = event.currentTarget.parentElement?.querySelectorAll("button");
                  buttons?.[mode === "sources" ? 1 : 0]?.focus();
                }
              }}
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
                  value={configuration.filter.query}
                  placeholder={t({ message: "Search titles, authors, tags and notes" })}
                  onChange={(event) => updateFilter({ query: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && event.currentTarget.value) {
                      event.preventDefault();
                      updateFilter({ query: "" });
                    } else if (event.key === "ArrowDown" || event.key === "Escape") {
                      event.preventDefault();
                      resultsAreaRef.current
                        ?.querySelector<HTMLElement>(
                          '.search-passage-list button, .library-table-row:not(.is-header)[tabindex="0"]',
                        )
                        ?.focus();
                    }
                  }}
                />
              </label>
            </div>
            <div
              ref={trailingControls}
              className="library-header-trailing"
              role="toolbar"
              aria-label={t`Library actions`}
            >
              <span className="library-result-count" role="status">
                {loading
                  ? t({ message: "Loading…", context: "LibraryWorkspace interface" })
                  : `${countLabel(matches.length, "source")}${indexLoading && !view.path ? t({ message: " · Loading more…" }) : ""}`}
              </span>
              {dirty && view.owned && view.writable ? (
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
                label={filterCount ? `${t`Filter`} · ${String(filterCount)}` : t`Filter`}
                title={t`Filter`}
                trigger={
                  <>
                    <FilterIcon />
                    {filterCount ? (
                      <span className="menu-badge" aria-hidden>
                        {filterCount}
                      </span>
                    ) : null}
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
                </div>
              </Menu>
              <Menu label={t`Display`} trigger={t`Display`} triggerClassName="library-save-button">
                <div className="library-options" data-menu-keep-open>
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
                </div>
              </Menu>
              <Menu className="library-actions" label={t`Library actions`} trigger={<MoreIcon />}>
                <button
                  type="button"
                  disabled={JSON.stringify(layout) === JSON.stringify(layoutOf(view.configuration))}
                  onClick={() => {
                    setLayout(layoutOf(view.configuration));
                    setLayoutResets((count) => count + 1);
                  }}
                >
                  <Trans>Reset columns</Trans>
                </button>
                <button type="button" onClick={() => setSaving(true)}>
                  <Trans>Save as new view…</Trans>
                </button>
                <button
                  type="button"
                  disabled={bibliographyExport.status === "exporting"}
                  onClick={() => bibliographyExport.runFor(exportScope)}
                >
                  {bibliographyExport.status === "exporting"
                    ? t({
                        message: "Preparing citations…",
                        context: "LibraryWorkspace interface",
                      })
                    : selectedSources.length > 0
                      ? t`Export citations (${String(selectedSources.length)} selected)`
                      : t`Export citations (${String(sources.length)} in this view)`}
                </button>
                <button
                  type="button"
                  aria-pressed={flatParts}
                  onClick={() => setFlatParts(!flatParts)}
                >
                  {flatParts
                    ? translate({ message: "Nest parts under books" })
                    : translate({ message: "Show parts as a flat list" })}
                </button>
                <CitationQualitySummary sources={allSources} loading={indexLoading} />
                <a href={importHref()} target="_blank" rel="noopener noreferrer">
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
                aria-label={translate({ message: "Add source…" })}
                title={translate({ message: "Add source…" })}
                onClick={onAddSource}
              >
                <PlusIcon />
              </button>
            </div>
          </>
        ) : null}
      </header>

      {problem ? (
        <div className="library-view-problem" role="alert">
          {problem}
        </div>
      ) : null}
      {writes.notice ? (
        <ReaderNotice>
          <span role="status">{writes.notice}</span>
        </ReaderNotice>
      ) : null}

      {indexLoading ? (
        <p className="menu-note" role="status">
          <Trans>Source index is partial; more parts and shared-file references may exist.</Trans>
        </p>
      ) : null}
      <div
        ref={(element) => {
          resultsAreaRef.current = element;
          if (!rendersSourceTable) {
            resultsRef.current = element;
          }
        }}
        id={focused ? "reader-library-results" : undefined}
        tabIndex={-1}
        className="library-workspace-results"
        onScrollCapture={(event) => {
          if (event.target === resultsRef.current) {
            scrollPositions.set(view.key, resultsRef.current.scrollTop);
          }
        }}
      >
        {mode === "annotations" ? (
          <CollectionAnnotations
            gateway={gateway}
            sources={allSources}
            onOpenAnnotation={(annotation) =>
              onOpenAnnotation
                ? onOpenAnnotation(annotation, false)
                : onOpenSource(annotation.sourceId)
            }
          />
        ) : (
          <>
            {!configuration.filter.query && !view.path ? (
              <ContinueReading sources={allSources} onOpen={onOpenSource} />
            ) : null}
            <LibraryNoteMatches
              search={noteSearch}
              sources={noteCandidates}
              onOpen={(id, view) =>
                onOpenSourceView ? onOpenSourceView(id, view) : onOpenSource(id)
              }
            />
            {emptySources && noteCandidates.length > 0 ? null : emptySources ? (
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
                      <Trans>Add source…</Trans>
                    </button>
                    <BrowserExtensionDiscovery placement="empty-library" />
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
            ) : rendersSourceTable ? (
              <LibraryTable
                key={layoutResets}
                sources={sources}
                partRows={parts.rows}
                onTogglePart={togglePart}
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
                // The E key exports the selection when the row is part of it.
                onExport={(rows) =>
                  bibliographyExport.runFor(
                    rows.some(({ id }) => visibleSelection.ids.has(id)) ? selectedSources : rows,
                  )
                }
                {...(onRemoveSource ? { onRemove: onRemoveSource } : {})}
                {...(changeStatus ? { onChangeStatus: changeStatus } : {})}
                {...(writes.saveField
                  ? {
                      onEditField: (source: SourceSummary, key: string, text: string) =>
                        writes.saveField?.(source, key, text).catch((reason: unknown) => {
                          setEditProblem(
                            readerErrorMessage(reason, t`Reader could not save ${key}.`),
                          );
                          throw reason;
                        }) ?? Promise.resolve(),
                    }
                  : {})}
              />
            ) : null}
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
          properties={view.properties}
          onOpen={(chosen) => {
            for (const source of chosen) {
              onOpenSource(source.id);
            }
          }}
          onExport={bibliographyExport.runFor}
        />
      ) : null}
      <OverlayPresence open={saving}>
        <LibraryViewSaveDialog
          description={t({
            message: "The filters, sort and columns are saved in your collection.",
          })}
          placeholder={t({ message: "e.g. Reading this month" })}
          saving={controller.saving}
          onCancel={() => setSaving(false)}
          onSave={(name) => void save(name, false)}
        />
      </OverlayPresence>
    </section>
  );
}

const noCounts: ReadonlyMap<SourceId, number> = new Map();

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

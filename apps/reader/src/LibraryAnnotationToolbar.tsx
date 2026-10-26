import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Select, type SelectItems } from "@mdbase-dev/ui/select";

import { emptyAnnotationFilter, type AnnotationFilter } from "./annotation-overview.js";
import { FilterIcon, SearchIcon } from "./icons.js";
import { countLabel } from "./LibraryCells.js";
import { LibraryConditionsEditor } from "./LibraryConditionsEditor.js";
import { Menu } from "./Menu.js";

import type { AnnotationSortField } from "./annotation-columns.js";
import type { AnnotationLayout } from "./mdbase-annotation-views.js";
import type { SourceAnnotationsViewAction } from "./use-annotation-view.js";
import type { SourceSummary } from "@mdbase-reader/core";
import type { JSX } from "react";

export interface AnnotationViewActions {
  /** Present when the open view is a saved annotations view with unsaved changes. */
  readonly onSave?: () => void;
  readonly saving: boolean;
  readonly onSaveAs: () => void;
  readonly onRefresh?: () => void;
  /** Present when the layout differs from the view's. */
  readonly onReset?: () => void;
  readonly sourceAnnotationsView: SourceAnnotationsViewAction | null;
}

/** Search, filters, sort and view actions for the annotations view. */
export function AnnotationToolbar({
  filter,
  onFilterChange,
  layout,
  onLayoutChange,
  count,
  tags,
  propertyKeys,
  sources,
  actions,
}: {
  readonly filter: AnnotationFilter;
  readonly onFilterChange: (filter: AnnotationFilter) => void;
  readonly layout: AnnotationLayout;
  readonly onLayoutChange: (layout: AnnotationLayout) => void;
  readonly count: number | null;
  readonly tags: readonly string[];
  readonly propertyKeys: readonly string[];
  readonly sources: readonly SourceSummary[];
  readonly actions: AnnotationViewActions;
}): JSX.Element {
  const { t } = useLingui();
  const filterCount =
    Number(filter.type !== "all") + Number(Boolean(filter.tag)) + filter.sourceConditions.length;
  return (
    <div className="library-annotations-toolbar">
      <label className="library-workspace-search">
        <SearchIcon />
        <span className="sr-only">{t({ message: "Search annotations" })}</span>
        <input
          className="library-annotations-search"
          value={filter.query}
          placeholder={t({ message: "Passage, note, source or tag" })}
          onChange={(event) => onFilterChange({ ...filter, query: event.target.value })}
        />
      </label>
      <span className="library-result-count" role="status">
        {count === null
          ? t({ message: "Loading…", context: "LibraryAnnotationToolbar interface" })
          : countLabel(count, "annotation")}
      </span>
      {actions.onSave ? (
        <button
          className="library-save-button"
          type="button"
          disabled={actions.saving}
          onClick={actions.onSave}
        >
          <Trans>Save view</Trans>
        </button>
      ) : null}
      <Menu
        className="library-workspace-more"
        label={t`Annotation view options${filterCount ? `, ${String(filterCount)} active filters` : ""}`}
        title={t({ message: "View options", context: "LibraryAnnotationToolbar interface" })}
        trigger={
          <>
            <FilterIcon />
            {filterCount ? <span className="menu-badge">{filterCount}</span> : null}
          </>
        }
      >
        <div className="library-options" data-menu-keep-open>
          <AnnotationFilters
            filter={filter}
            onFilterChange={onFilterChange}
            tags={tags}
            propertyKeys={propertyKeys}
            sources={sources}
          />
          {filterCount > 0 ? (
            <button
              className="library-clear-filters"
              type="button"
              onClick={() => onFilterChange({ ...emptyAnnotationFilter, query: filter.query })}
            >
              <Trans>Clear filters</Trans>
            </button>
          ) : null}
          <AnnotationSortControl layout={layout} onLayoutChange={onLayoutChange} />
        </div>
        <hr />
        <button type="button" onClick={actions.onRefresh} disabled={!actions.onRefresh}>
          <Trans>Refresh annotations</Trans>
        </button>
        <button type="button" disabled={!actions.onReset} onClick={actions.onReset}>
          <Trans>Reset columns and sort</Trans>
        </button>
        <button type="button" onClick={actions.onSaveAs}>
          <Trans>Save as new view…</Trans>
        </button>
        {actions.sourceAnnotationsView ? (
          <>
            <button
              type="button"
              data-menu-keep-open
              disabled={actions.sourceAnnotationsView.busy}
              title={t({
                message:
                  "A saved view that lists the annotations of whichever source it runs against",
              })}
              onClick={actions.sourceAnnotationsView.run}
            >
              <Trans>Add “Annotations for this source” view</Trans>
            </button>
            {actions.sourceAnnotationsView.message ? (
              <p className="menu-note" role="status">
                {actions.sourceAnnotationsView.message}
              </p>
            ) : null}
          </>
        ) : null}
      </Menu>
    </div>
  );
}

function AnnotationFilters({
  filter,
  onFilterChange,
  tags,
  propertyKeys,
  sources,
}: {
  readonly filter: AnnotationFilter;
  readonly onFilterChange: (filter: AnnotationFilter) => void;
  readonly tags: readonly string[];
  readonly propertyKeys: readonly string[];
  readonly sources: readonly SourceSummary[];
}): JSX.Element {
  const { t } = useLingui();
  return (
    <>
      <span className="menu-label">
        <Trans>Annotation</Trans>
      </span>
      <label>
        <span>{t({ message: "Type", context: "LibraryAnnotationToolbar interface" })}</span>
        <Select
          aria-label={t({ message: "Type", context: "LibraryAnnotationToolbar interface" })}
          value={filter.type}
          options={annotationTypeOptions()}
          onChange={(type) => onFilterChange({ ...filter, type })}
        />
      </label>
      <label>
        <span>{t({ message: "Tag" })}</span>
        <Select
          aria-label={t({ message: "Tag", context: "LibraryAnnotationToolbar interface" })}
          value={filter.tag}
          options={[
            {
              value: "",
              label: t({ message: "Any tag", context: "LibraryAnnotationToolbar interface" }),
            },
            ...tags.map((tag) => ({ value: tag, label: tag })),
          ]}
          onChange={(tag) => onFilterChange({ ...filter, tag })}
        />
      </label>
      <span className="menu-label">
        <Trans context="LibraryAnnotationToolbar interface">Source</Trans>
      </span>
      <LibraryConditionsEditor
        conditions={filter.sourceConditions}
        propertyKeys={propertyKeys}
        sources={sources}
        onChange={(sourceConditions) => onFilterChange({ ...filter, sourceConditions })}
      />
    </>
  );
}

function AnnotationSortControl({
  layout,
  onLayoutChange,
}: {
  readonly layout: AnnotationLayout;
  readonly onLayoutChange: (layout: AnnotationLayout) => void;
}): JSX.Element {
  const { t } = useLingui();
  return (
    <>
      <span className="menu-label">
        <Trans>Sort</Trans>
      </span>
      <div className="library-sort-control">
        <Select
          aria-label={t({ message: "Sort field", context: "LibraryAnnotationToolbar interface" })}
          value={layout.sortField}
          options={annotationSortOptions()}
          onChange={(sortField) => onLayoutChange({ ...layout, sortField })}
        />
        <button
          type="button"
          aria-label={layout.sortDirection === "asc" ? t`Sort descending` : t`Sort ascending`}
          title={
            layout.sortDirection === "asc"
              ? t({ message: "Ascending", context: "LibraryAnnotationToolbar interface" })
              : t({ message: "Descending", context: "LibraryAnnotationToolbar interface" })
          }
          onClick={() =>
            onLayoutChange({
              ...layout,
              sortDirection: layout.sortDirection === "asc" ? "desc" : "asc",
            })
          }
        >
          {layout.sortDirection === "asc" ? "↑" : "↓"}
        </button>
      </div>
    </>
  );
}

function annotationTypeOptions(): SelectItems<AnnotationFilter["type"]> {
  return [
    {
      value: "all",
      label: translate({
        message: "Any type",
        context: "LibraryAnnotationToolbar annotationTypeOptions",
      }),
    },
    {
      value: "highlight",
      label: translate({
        message: "Highlights",
        context: "LibraryAnnotationToolbar annotationTypeOptions",
      }),
    },
    { value: "area", label: translate`Area captures` },
    { value: "note", label: translate`Source comments` },
    {
      value: "bookmark",
      label: translate({
        message: "Bookmarks",
        context: "LibraryAnnotationToolbar annotationTypeOptions",
      }),
    },
  ];
}

function annotationSortOptions(): SelectItems<AnnotationSortField> {
  return [
    {
      value: "created",
      label: translate({
        message: "Created",
        context: "LibraryAnnotationToolbar annotationSortOptions",
      }),
    },
    {
      value: "source",
      label: translate({
        message: "Source",
        context: "LibraryAnnotationToolbar annotationSortOptions",
      }),
    },
    {
      value: "type",
      label: translate({
        message: "Type",
        context: "LibraryAnnotationToolbar annotationSortOptions",
      }),
    },
  ];
}

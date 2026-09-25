import { Select, type SelectItems } from "@mdbase-reader/ui";

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
  const filterCount =
    Number(filter.type !== "all") + Number(Boolean(filter.tag)) + filter.sourceConditions.length;
  return (
    <div className="library-annotations-toolbar">
      <label className="library-workspace-search">
        <SearchIcon />
        <span className="sr-only">Search annotations</span>
        <input
          className="library-annotations-search"
          value={filter.query}
          placeholder="Passage, note, source or tag"
          onChange={(event) => onFilterChange({ ...filter, query: event.target.value })}
        />
      </label>
      <span className="library-result-count" role="status">
        {count === null ? "Loading…" : countLabel(count, "annotation")}
      </span>
      {actions.onSave ? (
        <button
          className="library-save-button"
          type="button"
          disabled={actions.saving}
          onClick={actions.onSave}
        >
          Save view
        </button>
      ) : null}
      <Menu
        className="library-workspace-more"
        label={`Annotation view options${filterCount ? `, ${String(filterCount)} active filters` : ""}`}
        title="View options"
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
              Clear filters
            </button>
          ) : null}
          <AnnotationSortControl layout={layout} onLayoutChange={onLayoutChange} />
        </div>
        <hr />
        <button type="button" disabled={!actions.onReset} onClick={actions.onReset}>
          Reset columns and sort
        </button>
        <button type="button" onClick={actions.onSaveAs}>
          Save as new view…
        </button>
        {actions.sourceAnnotationsView ? (
          <>
            <button
              type="button"
              data-menu-keep-open
              disabled={actions.sourceAnnotationsView.busy}
              title="A saved view that lists the annotations of whichever source it runs against"
              onClick={actions.sourceAnnotationsView.run}
            >
              Add “Annotations for this source” view
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
  return (
    <>
      <span className="menu-label">Annotation</span>
      <label>
        <span>Type</span>
        <Select
          aria-label="Type"
          value={filter.type}
          options={annotationTypeOptions}
          onChange={(type) => onFilterChange({ ...filter, type })}
        />
      </label>
      <label>
        <span>Tag</span>
        <Select
          aria-label="Tag"
          value={filter.tag}
          options={[
            { value: "", label: "Any tag" },
            ...tags.map((tag) => ({ value: tag, label: tag })),
          ]}
          onChange={(tag) => onFilterChange({ ...filter, tag })}
        />
      </label>
      <span className="menu-label">Source</span>
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
  return (
    <>
      <span className="menu-label">Sort</span>
      <div className="library-sort-control">
        <Select
          aria-label="Sort field"
          value={layout.sortField}
          options={annotationSortOptions}
          onChange={(sortField) => onLayoutChange({ ...layout, sortField })}
        />
        <button
          type="button"
          aria-label={`Sort ${layout.sortDirection === "asc" ? "descending" : "ascending"}`}
          title={layout.sortDirection === "asc" ? "Ascending" : "Descending"}
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

const annotationTypeOptions: SelectItems<AnnotationFilter["type"]> = [
  { value: "all", label: "Any type" },
  { value: "highlight", label: "Highlights" },
  { value: "area", label: "Areas" },
  { value: "note", label: "Comments" },
  { value: "bookmark", label: "Bookmarks" },
];

const annotationSortOptions: SelectItems<AnnotationSortField> = [
  { value: "created", label: "Created" },
  { value: "source", label: "Source" },
  { value: "type", label: "Type" },
];

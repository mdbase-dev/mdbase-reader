import {
  emptyAnnotationFilter,
  type AnnotationFilter,
  type AnnotationSort,
} from "./annotation-overview.js";
import { FilterIcon, SearchIcon } from "./icons.js";
import { countLabel } from "./LibraryCells.js";
import { LibraryConditionsEditor } from "./LibraryConditionsEditor.js";
import { Menu } from "./Menu.js";

import type { SourceSummary } from "@mdbase-reader/core";
import type { JSX } from "react";

/** Search, sort and filters for the annotations view. */
export function AnnotationToolbar({
  filter,
  onFilterChange,
  sort,
  onSortChange,
  count,
  tags,
  propertyKeys,
  sources,
}: {
  readonly filter: AnnotationFilter;
  readonly onFilterChange: (filter: AnnotationFilter) => void;
  readonly sort: AnnotationSort;
  readonly onSortChange: (sort: AnnotationSort) => void;
  readonly count: number | null;
  readonly tags: readonly string[];
  readonly propertyKeys: readonly string[];
  readonly sources: readonly SourceSummary[];
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
      <label className="library-annotations-sort">
        <span className="sr-only">Sort annotations</span>
        <select
          value={sort}
          onChange={(event) => onSortChange(event.target.value as AnnotationSort)}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="source">By source</option>
        </select>
      </label>
      <Menu
        className="library-workspace-more"
        label={`Annotation filters${filterCount ? `, ${String(filterCount)} active` : ""}`}
        title="Annotation filters"
        trigger={
          <>
            <FilterIcon />
            {filterCount ? <span className="menu-badge">{filterCount}</span> : null}
          </>
        }
      >
        <div className="library-options" data-menu-keep-open>
          <span className="menu-label">Annotation</span>
          <label>
            <span>Type</span>
            <select
              value={filter.type}
              onChange={(event) =>
                onFilterChange({ ...filter, type: event.target.value as AnnotationFilter["type"] })
              }
            >
              <option value="all">Any type</option>
              <option value="highlight">Highlights</option>
              <option value="note">Notes</option>
              <option value="area">Areas</option>
            </select>
          </label>
          <label>
            <span>Tag</span>
            <select
              value={filter.tag}
              onChange={(event) => onFilterChange({ ...filter, tag: event.target.value })}
            >
              <option value="">Any tag</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
          <span className="menu-label">Source</span>
          <LibraryConditionsEditor
            conditions={filter.sourceConditions}
            propertyKeys={propertyKeys}
            sources={sources}
            onChange={(sourceConditions) => onFilterChange({ ...filter, sourceConditions })}
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
        </div>
      </Menu>
    </div>
  );
}

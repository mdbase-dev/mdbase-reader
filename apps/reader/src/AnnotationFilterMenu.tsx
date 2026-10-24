import { useId, useMemo, type JSX } from "react";

import {
  searchAnnotationIndex,
  type AnnotationFilter,
  type indexAnnotations,
} from "./annotation-list-order.js";
import { FilterIcon } from "./icons.js";
import { Menu } from "./Menu.js";

import type { SourceSummary } from "@mdbase-reader/core";

export type AnnotationOrder = "document" | "newest";

/** What the Notes panel lists: kind of annotation, order, and (for a book) which source. */
export interface AnnotationView {
  readonly filter: AnnotationFilter;
  readonly order: AnnotationOrder;
  /** A source id, or "" for every source in the panel. */
  readonly source: string;
}

export const defaultAnnotationView: AnnotationView = {
  filter: "all",
  order: "document",
  source: "",
};

export function annotationViewIsDefault(view: AnnotationView): boolean {
  return (
    view.filter === defaultAnnotationView.filter &&
    view.order === defaultAnnotationView.order &&
    view.source === defaultAnnotationView.source
  );
}

const filterChoices: readonly { readonly value: AnnotationFilter; readonly label: string }[] = [
  { value: "all", label: "All annotations" },
  { value: "highlight", label: "Highlights" },
  { value: "comments", label: "With comments" },
  { value: "area", label: "Area captures" },
  { value: "note", label: "Source comments" },
  { value: "bookmark", label: "Bookmarks" },
];

const orderChoices: readonly { readonly value: AnnotationOrder; readonly label: string }[] = [
  { value: "document", label: "Document order" },
  { value: "newest", label: "Newest first" },
];

/**
 * One menu for everything that changes what the list shows: type, source, order, following the
 * reading position, and page search. A dot on the trigger says something is not at its default.
 */
export function AnnotationFilterMenu({
  view,
  onViewChange,
  scoped,
  owners,
  wholeBook,
  following,
  onFollowingChange,
  canFollow,
  renderAll,
  onRenderAllChange,
  changed,
}: {
  readonly view: AnnotationView;
  readonly onViewChange: (view: AnnotationView) => void;
  /** The searchable annotations within the chosen source, for per-type counts. */
  readonly scoped: ReturnType<typeof indexAnnotations>;
  readonly owners?: readonly SourceSummary[] | undefined;
  readonly wholeBook?:
    { readonly value: boolean; readonly onChange: (value: boolean) => void } | undefined;
  readonly following: boolean;
  readonly onFollowingChange: (following: boolean) => void;
  readonly canFollow: boolean;
  readonly renderAll: boolean;
  readonly onRenderAllChange: (renderAll: boolean) => void;
  readonly changed: boolean;
}): JSX.Element {
  const id = useId();
  const counts = useMemo(
    () =>
      new Map(
        filterChoices.map(({ value }) => [value, searchAnnotationIndex(scoped, "", value).length]),
      ),
    [scoped],
  );
  return (
    <Menu
      className="annotation-filter-menu"
      label={changed ? "Filter annotations (changed)" : "Filter annotations"}
      title="Filter annotations"
      triggerClassName={`icon-button annotation-filter-trigger${changed ? " is-changed" : ""}`}
      trigger={<FilterIcon />}
    >
      {/* Choices apply at once and leave the menu open, so several can be changed together. */}
      <div className="annotation-filter-panel" data-menu-keep-open>
        <div role="group" aria-labelledby={`${id}-show`}>
          <span className="menu-label" id={`${id}-show`}>
            Show
          </span>
          {filterChoices.map((choice) => (
            <button
              key={choice.value}
              type="button"
              className="annotation-filter-choice"
              aria-pressed={view.filter === choice.value}
              onClick={() => onViewChange({ ...view, filter: choice.value })}
            >
              {choice.label}
              <span className="annotation-filter-count">{counts.get(choice.value) ?? 0}</span>
            </button>
          ))}
        </div>
        {owners && owners.length > 1 ? (
          <label className="annotation-filter-source">
            <span className="menu-label">Source</span>
            <select
              aria-label="Filter annotations by source"
              value={view.source}
              onChange={(event) => onViewChange({ ...view, source: event.target.value })}
            >
              <option value="">All sources</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <hr />
        <div role="group" aria-labelledby={`${id}-order`}>
          <span className="menu-label" id={`${id}-order`}>
            Order
          </span>
          {orderChoices.map((choice) => (
            <button
              key={choice.value}
              type="button"
              className="annotation-filter-choice"
              aria-pressed={view.order === choice.value}
              onClick={() => onViewChange({ ...view, order: choice.value })}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <hr />
        {wholeBook ? (
          <SwitchItem
            label="Show the whole book’s annotations"
            checked={wholeBook.value}
            onChange={wholeBook.onChange}
          />
        ) : null}
        {canFollow ? (
          <SwitchItem
            label="Follow reading position"
            checked={following}
            onChange={onFollowingChange}
          />
        ) : null}
        <SwitchItem
          label="Include all annotations in page search"
          hint={renderAll ? "Slower with long lists" : "Search above covers all annotations"}
          checked={renderAll}
          onChange={onRenderAllChange}
        />
      </div>
    </Menu>
  );
}

function SwitchItem({
  label,
  hint,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly hint?: string | undefined;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}): JSX.Element {
  const hintId = useId();
  return (
    <button
      type="button"
      role="switch"
      className="annotation-filter-switch"
      aria-checked={checked}
      aria-describedby={hint ? hintId : undefined}
      onClick={() => onChange(!checked)}
    >
      <span className="annotation-filter-switch-label">
        {label}
        {hint ? <small id={hintId}>{hint}</small> : null}
      </span>
      <span className="annotation-filter-switch-track" aria-hidden="true" />
    </button>
  );
}

import { useState, type DragEvent, type JSX, type KeyboardEvent } from "react";

import { ChevronDownIcon, PlusIcon } from "./icons.js";
import {
  builtinLibraryColumns,
  columnLabel,
  isPropertyKey,
  maximumColumnWidth,
  minimumColumnWidth,
  propertyColumn,
  propertyKey,
  type LibraryColumn,
} from "./library-columns.js";
import { Menu } from "./Menu.js";

import type { LibrarySortDirection, LibrarySortField } from "./mdbase-library-views.js";

type ViewProperties = readonly { readonly key: string; readonly label?: string }[];

const unsortable: ReadonlySet<LibraryColumn> = new Set(["annotations", "format", "tags"]);

/** Whether a column maps to a field a saved view can order by. */
export function sortFieldFor(column: LibraryColumn): LibrarySortField | null {
  return unsortable.has(column) ? null : (column as LibrarySortField);
}

/** Dates and numbers read best newest or largest first; text reads A to Z. */
export function firstSortDirection(column: LibraryColumn): LibrarySortDirection {
  return column === "published" || column === "opened" ? "desc" : "asc";
}

export interface HeaderCellProps {
  readonly column: LibraryColumn;
  readonly index: number;
  readonly count: number;
  readonly properties: ViewProperties;
  readonly sort: LibrarySortDirection | null;
  readonly resizing: boolean;
  readonly width: number;
  readonly dropSide: "before" | "after" | null;
  readonly onSort: (direction: LibrarySortDirection) => void;
  readonly onMove: (to: number) => void;
  readonly onHide: () => void;
  readonly onResetWidth: () => void;
  readonly onResizeStart: (event: unknown) => void;
  readonly onResizeBy: (delta: number) => void;
  readonly onDragStart: () => void;
  readonly onDragOver: (side: "before" | "after") => void;
  readonly onDrop: () => void;
  readonly onDragEnd: () => void;
}

export function HeaderCell(props: HeaderCellProps): JSX.Element {
  const { column, index, count, properties, sort } = props;
  const label = columnLabel(column, properties);
  const sortable = sortFieldFor(column) !== null;
  const next: LibrarySortDirection =
    sort === null ? firstSortDirection(column) : sort === "asc" ? "desc" : "asc";
  return (
    <div
      role="columnheader"
      tabIndex={-1}
      aria-colindex={index + 1}
      aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : "none"}
      className={`library-column-header is-${columnClass(column)}${props.resizing ? " is-resizing" : ""}${props.dropSide ? ` is-drop-${props.dropSide}` : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        props.onDragOver(dropSide(event));
      }}
      onDrop={(event) => {
        event.preventDefault();
        props.onDrop();
      }}
      onDragEnd={props.onDragEnd}
    >
      {sortable ? (
        <button
          type="button"
          className="library-column-sort"
          title={`Sort by ${label.toLocaleLowerCase()} · Drag to move`}
          onClick={() => props.onSort(next)}
          {...dragSource(column, props.onDragStart)}
        >
          <span>{label}</span>
          {sort ? (
            <span className="library-sort-indicator" aria-hidden="true">
              {sort === "asc" ? "↑" : "↓"}
            </span>
          ) : null}
        </button>
      ) : (
        <span
          className="library-column-label"
          title="Drag to move"
          {...dragSource(column, props.onDragStart)}
        >
          {label}
        </span>
      )}
      <Menu
        className="library-column-menu"
        label={`${label} column options`}
        title="Column options"
        align={index === 0 ? "start" : "end"}
        trigger={<ChevronDownIcon />}
      >
        {sortable ? (
          <>
            <button type="button" onClick={() => props.onSort("asc")}>
              Sort ascending
            </button>
            <button type="button" onClick={() => props.onSort("desc")}>
              Sort descending
            </button>
            <hr />
          </>
        ) : null}
        <button type="button" disabled={index === 0} onClick={() => props.onMove(index - 1)}>
          Move left
        </button>
        <button
          type="button"
          disabled={index === count - 1}
          onClick={() => props.onMove(index + 1)}
        >
          Move right
        </button>
        <button type="button" onClick={props.onResetWidth}>
          Reset width
        </button>
        {column !== "title" ? (
          <>
            <hr />
            <button type="button" onClick={props.onHide}>
              Hide column
            </button>
          </>
        ) : null}
      </Menu>
      {/* A focusable separator is the ARIA window-splitter pattern: arrows resize the column. */}
      {/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <span
        role="separator"
        aria-valuenow={props.width}
        aria-valuemin={minimumColumnWidth}
        aria-valuemax={maximumColumnWidth}
        aria-orientation="vertical"
        aria-label={`Resize ${label} column`}
        title="Drag to resize · Double-click to reset"
        tabIndex={0}
        className="library-column-resizer"
        onMouseDown={(event) => {
          // Without this, the press starts a text selection that Chromium turns into a
          // drag of the neighbouring label, which swallows the mouseup and never ends the resize.
          event.preventDefault();
          props.onResizeStart(event);
        }}
        onTouchStart={props.onResizeStart}
        onDoubleClick={props.onResetWidth}
        onKeyDown={(event) => resizeKey(event, props.onResizeBy)}
      />
      {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
    </div>
  );
}

/** Only the label starts a column move, so dragging the resize handle never does. */
function dragSource(
  column: LibraryColumn,
  onDragStart: () => void,
): Pick<JSX.IntrinsicElements["span"], "draggable" | "onDragStart"> {
  return {
    draggable: true,
    onDragStart: (event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", column);
      onDragStart();
    },
  };
}

function resizeKey(event: KeyboardEvent, resizeBy: (delta: number) => void): void {
  const delta = { ArrowLeft: -16, ArrowRight: 16 }[event.key];
  if (delta !== undefined) {
    event.preventDefault();
    resizeBy(event.shiftKey ? delta * 4 : delta);
  }
}

function dropSide(event: DragEvent<HTMLElement>): "before" | "after" {
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientX < box.left + box.width / 2 ? "before" : "after";
}

/** A CSS-safe class for a column, e.g. `is-property`. */
export function columnClass(column: LibraryColumn): string {
  return propertyKey(column) === null ? column : "property";
}

/** The trailing header cell: add any Reader field or collection property as a column. */
export function AddColumnCell({
  columns,
  properties,
  propertyKeys,
  onAdd,
}: {
  readonly columns: readonly LibraryColumn[];
  readonly properties: ViewProperties;
  readonly propertyKeys: readonly string[];
  readonly onAdd: (column: LibraryColumn) => void;
}): JSX.Element {
  const [custom, setCustom] = useState("");
  const shown = new Set(columns);
  const fields = builtinLibraryColumns.filter((column) => !shown.has(column));
  const available = propertyKeys.filter((key) => !shown.has(propertyColumn(key))).slice(0, 40);
  const key = custom.trim();
  const valid = isPropertyKey(key) && !shown.has(propertyColumn(key));
  return (
    <div role="columnheader" tabIndex={-1} className="library-column-header is-add">
      <Menu
        className="library-add-column"
        label="Add column"
        title="Add column"
        triggerClassName="icon-button library-add-column-trigger"
        trigger={<PlusIcon />}
      >
        {fields.length > 0 ? <span className="menu-label">Reader fields</span> : null}
        {fields.map((column) => (
          <button key={column} type="button" onClick={() => onAdd(column)}>
            {columnLabel(column)}
          </button>
        ))}
        {available.length > 0 ? <span className="menu-label">Properties</span> : null}
        {available.map((property) => (
          <button
            key={property}
            type="button"
            className="library-property-choice"
            onClick={() => onAdd(propertyColumn(property))}
          >
            <span>{columnLabel(propertyColumn(property), properties)}</span>
            <code>{property}</code>
          </button>
        ))}
        <form
          className="library-custom-column"
          data-menu-keep-open
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) {
              onAdd(propertyColumn(key));
              setCustom("");
            }
          }}
        >
          <label>
            <span className="menu-label">Any field</span>
            <input
              value={custom}
              placeholder="e.g. course or csl.volume"
              spellCheck={false}
              onChange={(event) => setCustom(event.target.value)}
            />
          </label>
          <button type="submit" disabled={!valid}>
            Add
          </button>
        </form>
      </Menu>
    </div>
  );
}

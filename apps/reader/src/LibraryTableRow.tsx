import { isEditableSourceField } from "@mdbase-reader/core";

import { columnFieldKey, type LibraryColumn } from "./library-columns.js";
import { StatusPicker, TableValue } from "./LibraryCells.js";
import { LibraryFieldCellEditor } from "./LibraryFieldCell.js";
import { columnClass } from "./LibraryTableHeader.js";

import type { LibraryTableProps } from "./LibraryTable.js";
import type { LongPress } from "./use-long-press.js";
import type { SourceSummary } from "@mdbase-reader/core";
import type { JSX, MouseEvent } from "react";

export function LibraryTableRow({
  source,
  index,
  top,
  gridTemplateColumns,
  tabbable,
  layout,
  selection,
  annotationCounts,
  valuesByPath,
  onSelect,
  press,
  onLongPress,
  onMenu,
  onOpen,
  onChangeStatus,
  onEditField,
  editing,
  onEditCell,
  onEditDone,
}: LibraryTableProps & {
  readonly source: SourceSummary;
  readonly index: number;
  readonly top: number;
  readonly gridTemplateColumns: string;
  readonly tabbable: boolean;
  readonly onSelect: (event: MouseEvent<HTMLElement>) => void;
  readonly press: LongPress;
  readonly onLongPress: () => void;
  /** Opens this source's actions at a point, as a right-click does. */
  readonly onMenu: (x: number, y: number) => void;
  readonly editing: LibraryColumn | null;
  readonly onEditCell: (column: LibraryColumn) => void;
  readonly onEditDone: () => void;
}): JSX.Element {
  const selected = selection.ids.has(source.id);
  const pressHandlers = press.bind(onLongPress);
  const editable = (column: LibraryColumn): boolean =>
    onEditField !== undefined && isEditableColumn(column);
  return (
    // Rows take keyboard input through the grid's roving focus; see handleGridKey.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      className={`library-table-row${selected ? " is-selected" : ""}`}
      role="row"
      aria-rowindex={index + 2}
      aria-selected={selected}
      data-row-index={index}
      tabIndex={tabbable ? 0 : -1}
      title="Double-click or press Enter to open"
      style={{ gridTemplateColumns, transform: `translateY(${String(top)}px)` }}
      {...pressHandlers}
      onContextMenu={(event) => {
        pressHandlers.onContextMenu(event);
        // A touch long-press selects instead; everything else gets this source's actions.
        if (!event.defaultPrevented) {
          event.preventDefault();
          onMenu(event.clientX, event.clientY);
        }
      }}
      onClick={(event) => {
        if (!press.consumeClick()) {
          onSelect(event);
        }
      }}
      onDoubleClick={() => {
        // While selecting by touch, a quick second tap toggles; it must not open the source.
        if (!selection.touch) {
          onOpen(source.id);
        }
      }}
    >
      {layout.columns.map((column: LibraryColumn, columnIndex) => (
        // Keyboard users edit with F2 on the focused row (handled by the grid).
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events
        <span
          key={column}
          role="gridcell"
          tabIndex={-1}
          aria-colindex={columnIndex + 1}
          className={`is-${columnClass(column)}${editable(column) ? " is-editable" : ""}`}
          title={editable(column) ? "Click to edit · F2" : undefined}
          onClick={(event) => {
            // Like a spreadsheet: the first click selects the row, a click on its field edits it.
            if (editable(column) && selected && selection.ids.size === 1 && !event.shiftKey) {
              event.stopPropagation();
              onEditCell(column);
            }
          }}
        >
          {editing === column && onEditField ? (
            <LibraryFieldCellEditor
              source={source}
              fieldKey={columnFieldKey(column) ?? column}
              onSave={(text) => onEditField(source, columnFieldKey(column) ?? column, text)}
              onDone={onEditDone}
            />
          ) : column === "status" && onChangeStatus ? (
            <StatusPicker source={source} onChange={onChangeStatus} />
          ) : (
            <TableValue
              source={source}
              column={column}
              annotations={annotationCounts.get(source.id) ?? 0}
              selected={valuesByPath.get(source.path)}
            />
          )}
        </span>
      ))}
    </div>
  );
}

/** Frontmatter fields can be edited in place; Reader's own columns have their own controls. */
export function isEditableColumn(column: LibraryColumn): boolean {
  const key = columnFieldKey(column);
  return key !== null && isEditableSourceField(key);
}

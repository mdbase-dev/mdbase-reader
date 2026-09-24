import { useState, type JSX, type ReactNode } from "react";

import { HeaderCell } from "./LibraryTableHeader.js";
import { clampWidth, type ColumnsTable } from "./use-table-columns.js";

import type { RowData } from "@tanstack/react-table";

export type SortDirection = "asc" | "desc";

/** How one column's header presents itself; the table decides what each column means. */
export interface HeaderColumn {
  readonly id: string;
  readonly label: string;
  /** Null when the column cannot be sorted by. */
  readonly sort: { readonly active: SortDirection | null; readonly first: SortDirection } | null;
  /** A CSS-safe name, used as `is-<name>`. */
  readonly className: string;
  readonly hideable: boolean;
}

/** A sticky header row: sorting, per-column menus, resizing, reordering and hiding columns. */
export function TableHeadRow<Row extends RowData>({
  table,
  gridTemplateColumns,
  columns,
  onColumnsChange,
  onSort,
  trailing,
}: {
  readonly table: ColumnsTable<Row>;
  readonly gridTemplateColumns: string;
  readonly columns: readonly HeaderColumn[];
  readonly onColumnsChange: (ids: readonly string[]) => void;
  readonly onSort: (id: string, direction: SortDirection) => void;
  /** A last cell after the columns, such as an add-column menu. */
  readonly trailing?: ReactNode;
}): JSX.Element {
  const ids = columns.map(({ id }) => id);
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ column: string; side: "before" | "after" } | null>(null);
  const headers = table.getHeaderGroups()[0]?.headers ?? [];
  const move = (from: number, to: number): void => {
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) {
      return;
    }
    next.splice(Math.max(0, Math.min(next.length, to)), 0, moved);
    onColumnsChange(next);
  };
  const endDrag = (): void => {
    setDragging(null);
    setDrop(null);
  };
  return (
    <div role="rowgroup" className="library-table-head">
      <div
        className="library-table-row is-header"
        role="row"
        aria-rowindex={1}
        style={{ gridTemplateColumns }}
      >
        {columns.map((column, index) => {
          const header = headers.find((candidate) => candidate.column.id === column.id);
          const tableColumn = table.getColumn(column.id);
          return (
            <HeaderCell
              key={column.id}
              column={column.id}
              label={column.label}
              className={column.className}
              sortable={column.sort !== null}
              sort={column.sort?.active ?? null}
              firstDirection={column.sort?.first ?? "asc"}
              hideable={column.hideable}
              index={index}
              count={columns.length}
              resizing={tableColumn?.getIsResizing() ?? false}
              width={Math.round(tableColumn?.getSize() ?? 0)}
              dropSide={drop?.column === column.id && dragging !== column.id ? drop.side : null}
              onSort={(direction) => onSort(column.id, direction)}
              onMove={(to) => move(index, to)}
              onHide={() => onColumnsChange(ids.filter((id) => id !== column.id))}
              onResetWidth={() => tableColumn?.resetSize()}
              onResizeStart={(event) => header?.getResizeHandler()(event)}
              onResizeBy={(delta) =>
                table.setColumnSizing((sizes) => ({
                  ...sizes,
                  [column.id]: clampWidth((tableColumn?.getSize() ?? 160) + delta),
                }))
              }
              onDragStart={() => setDragging(column.id)}
              onDragOver={(side) => setDrop({ column: column.id, side })}
              onDrop={() => {
                const from = dragging === null ? -1 : ids.indexOf(dragging);
                if (from >= 0 && dragging !== column.id) {
                  const target = index + (drop?.side === "after" ? 1 : 0);
                  move(from, from < target ? target - 1 : target);
                }
                endDrag();
              }}
              onDragEnd={endDrag}
            />
          );
        })}
        {trailing}
      </div>
    </div>
  );
}

import { useState, type JSX } from "react";

import { AddColumnCell, HeaderCell, sortFieldFor } from "./LibraryTableHeader.js";
import { clampWidth, type LibraryColumnsTable } from "./use-library-columns.js";

import type { LibraryColumn } from "./library-columns.js";
import type { LibraryLayout } from "./use-library-layout-draft.js";

/** The sticky header row: sorting, per-column menus, resizing, reordering and adding columns. */
export function LibraryTableHead(props: {
  readonly table: LibraryColumnsTable;
  readonly gridTemplateColumns: string;
  readonly layout: LibraryLayout;
  readonly onLayoutChange: (layout: LibraryLayout) => void;
  readonly properties: readonly { readonly key: string; readonly label?: string }[];
  readonly propertyKeys: readonly string[];
}): JSX.Element {
  const { layout, onLayoutChange, table } = props;
  const columns = layout.columns;
  const [dragging, setDragging] = useState<LibraryColumn | null>(null);
  const [drop, setDrop] = useState<{ column: LibraryColumn; side: "before" | "after" } | null>(
    null,
  );
  const headers = table.getHeaderGroups()[0]?.headers ?? [];
  const move = (from: number, to: number): void => {
    const next = [...columns];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) {
      return;
    }
    next.splice(Math.max(0, Math.min(next.length, to)), 0, moved);
    onLayoutChange({ ...layout, columns: next });
  };
  return (
    <div role="rowgroup" className="library-table-head">
      <div
        className="library-table-row is-header"
        role="row"
        aria-rowindex={1}
        style={{ gridTemplateColumns: props.gridTemplateColumns }}
      >
        {columns.map((column, index) => {
          const header = headers.find((candidate) => candidate.column.id === column);
          const tableColumn = table.getColumn(column);
          return (
            <HeaderCell
              key={column}
              column={column}
              index={index}
              count={columns.length}
              properties={props.properties}
              sort={layout.sortField === sortFieldFor(column) ? layout.sortDirection : null}
              resizing={tableColumn?.getIsResizing() ?? false}
              width={Math.round(tableColumn?.getSize() ?? 0)}
              dropSide={drop?.column === column && dragging !== column ? drop.side : null}
              onSort={(direction) => {
                const field = sortFieldFor(column);
                if (field) {
                  onLayoutChange({ ...layout, sortField: field, sortDirection: direction });
                }
              }}
              onMove={(to) => move(index, to)}
              onHide={() =>
                onLayoutChange({ ...layout, columns: columns.filter((item) => item !== column) })
              }
              onResetWidth={() => tableColumn?.resetSize()}
              onResizeStart={(event) => header?.getResizeHandler()(event)}
              onResizeBy={(delta) =>
                table.setColumnSizing((sizes) => ({
                  ...sizes,
                  [column]: clampWidth((tableColumn?.getSize() ?? 160) + delta),
                }))
              }
              onDragStart={() => setDragging(column)}
              onDragOver={(side) => setDrop({ column, side })}
              onDrop={() => {
                const from = dragging === null ? -1 : columns.indexOf(dragging);
                if (from >= 0 && dragging !== column) {
                  const target = index + (drop?.side === "after" ? 1 : 0);
                  move(from, from < target ? target - 1 : target);
                }
                setDragging(null);
                setDrop(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDrop(null);
              }}
            />
          );
        })}
        <AddColumnCell
          columns={columns}
          properties={props.properties}
          propertyKeys={props.propertyKeys}
          onAdd={(column) => onLayoutChange({ ...layout, columns: [...columns, column] })}
        />
      </div>
    </div>
  );
}

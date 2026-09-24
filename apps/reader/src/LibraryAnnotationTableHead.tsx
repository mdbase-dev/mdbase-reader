import { useMemo, type JSX } from "react";

import {
  annotationColumnLabel,
  annotationColumns,
  annotationSortFieldFor,
  defaultAnnotationColumnWidth,
  firstAnnotationSortDirection,
  type AnnotationColumn,
} from "./annotation-columns.js";
import { PlusIcon } from "./icons.js";
import { Menu } from "./Menu.js";
import { TableHeadRow } from "./TableHeadRow.js";
import { useTableColumns, type ColumnsTable } from "./use-table-columns.js";

import type { AnnotationEntry } from "./annotation-overview.js";
import type { AnnotationLayout } from "./mdbase-annotation-views.js";

/** Column sizes from TanStack Table, as a CSS grid template with a trailing add-column cell. */
export function useAnnotationColumns(
  entries: readonly AnnotationEntry[],
  layout: AnnotationLayout,
  onLayoutChange: (layout: AnnotationLayout) => void,
): {
  readonly table: ColumnsTable<AnnotationEntry>;
  readonly gridTemplateColumns: string;
  readonly width: number;
} {
  const specs = useMemo(
    () =>
      layout.columns.map((column) => ({
        id: column,
        header: annotationColumnLabel(column),
        size: defaultAnnotationColumnWidth(column),
      })),
    [layout.columns],
  );
  const table = useTableColumns({
    rows: entries,
    columns: specs,
    columnWidths: layout.columnWidths,
    onWidthsChange: (columnWidths) => onLayoutChange({ ...layout, columnWidths }),
    getRowId: (entry) => entry.annotation.id,
  });
  const sizes = layout.columns.map(
    (column) => table.getColumn(column)?.getSize() ?? defaultAnnotationColumnWidth(column),
  );
  const gridTemplateColumns = `${sizes.map((size) => `${String(size)}px`).join(" ")} minmax(44px, 1fr)`;
  const width = sizes.reduce((total, size) => total + size, 0) + 60;
  return { table, gridTemplateColumns, width };
}

export function AnnotationTableHead({
  table,
  gridTemplateColumns,
  layout,
  onLayoutChange,
}: {
  readonly table: ColumnsTable<AnnotationEntry>;
  readonly gridTemplateColumns: string;
  readonly layout: AnnotationLayout;
  readonly onLayoutChange: (layout: AnnotationLayout) => void;
}): JSX.Element {
  return (
    <TableHeadRow
      table={table}
      gridTemplateColumns={gridTemplateColumns}
      columns={layout.columns.map((column) => {
        const field = annotationSortFieldFor(column);
        return {
          id: column,
          label: annotationColumnLabel(column),
          sort:
            field === null
              ? null
              : {
                  active: layout.sortField === field ? layout.sortDirection : null,
                  first: firstAnnotationSortDirection(field),
                },
          className: `annotation-${column}`,
          hideable: column !== "passage",
        };
      })}
      onColumnsChange={(ids) =>
        onLayoutChange({
          ...layout,
          columns: ids.flatMap((id) => layout.columns.filter((column) => column === id)),
        })
      }
      onSort={(id, direction) => {
        const field = annotationSortFieldFor(id as AnnotationColumn);
        if (field) {
          onLayoutChange({ ...layout, sortField: field, sortDirection: direction });
        }
      }}
      trailing={
        <AddAnnotationColumn
          columns={layout.columns}
          onAdd={(column) => onLayoutChange({ ...layout, columns: [...layout.columns, column] })}
        />
      }
    />
  );
}

/** The trailing header cell: shows the columns that are hidden. */
function AddAnnotationColumn({
  columns,
  onAdd,
}: {
  readonly columns: readonly AnnotationColumn[];
  readonly onAdd: (column: AnnotationColumn) => void;
}): JSX.Element {
  const hidden = annotationColumns.filter((column) => !columns.includes(column));
  return (
    <div role="columnheader" tabIndex={-1} className="library-column-header is-add">
      <Menu
        className="library-add-column"
        label="Add column"
        title="Add column"
        triggerClassName="icon-button library-add-column-trigger"
        trigger={<PlusIcon />}
      >
        {hidden.length > 0 ? (
          hidden.map((column) => (
            <button key={column} type="button" onClick={() => onAdd(column)}>
              {annotationColumnLabel(column)}
            </button>
          ))
        ) : (
          <p className="menu-note">Every column is shown.</p>
        )}
      </Menu>
    </div>
  );
}

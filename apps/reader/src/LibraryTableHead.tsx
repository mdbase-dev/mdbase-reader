import { columnLabel, type LibraryColumn } from "./library-columns.js";
import {
  AddColumnCell,
  columnClass,
  firstSortDirection,
  sortFieldFor,
} from "./LibraryTableHeader.js";
import { TableHeadRow } from "./TableHeadRow.js";

import type { LibraryColumnsTable } from "./use-library-columns.js";
import type { LibraryLayout } from "./use-library-layout-draft.js";
import type { JSX } from "react";

/** The library table's header row, with an add-column menu at its end. */
export function LibraryTableHead(props: {
  readonly table: LibraryColumnsTable;
  readonly gridTemplateColumns: string;
  readonly layout: LibraryLayout;
  readonly onLayoutChange: (layout: LibraryLayout) => void;
  readonly properties: readonly { readonly key: string; readonly label?: string }[];
  readonly propertyKeys: readonly string[];
}): JSX.Element {
  const { layout, onLayoutChange } = props;
  const columns = layout.columns;
  return (
    <TableHeadRow
      table={props.table}
      gridTemplateColumns={props.gridTemplateColumns}
      columns={columns.map((column) => ({
        id: column,
        label: columnLabel(column, props.properties),
        sort:
          sortFieldFor(column) === null
            ? null
            : {
                active: layout.sortField === sortFieldFor(column) ? layout.sortDirection : null,
                first: firstSortDirection(column),
              },
        className: columnClass(column),
        hideable: column !== "title",
      }))}
      onColumnsChange={(ids) =>
        onLayoutChange({
          ...layout,
          columns: ids.flatMap((id) => columns.filter((column) => column === id)),
        })
      }
      onSort={(id, direction) => {
        const field = sortFieldFor(id as LibraryColumn);
        if (field) {
          onLayoutChange({ ...layout, sortField: field, sortDirection: direction });
        }
      }}
      trailing={
        <AddColumnCell
          columns={columns}
          properties={props.properties}
          propertyKeys={props.propertyKeys}
          onAdd={(column) => onLayoutChange({ ...layout, columns: [...columns, column] })}
        />
      }
    />
  );
}

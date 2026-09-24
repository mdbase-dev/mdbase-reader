import { useMemo } from "react";

import { columnLabel, defaultColumnWidth } from "./library-columns.js";
import { useTableColumns, type ColumnsTable } from "./use-table-columns.js";

import type { LibraryLayout } from "./use-library-layout-draft.js";
import type { SourceSummary } from "@mdbase-reader/core";

export { clampWidth } from "./use-table-columns.js";
export type LibraryColumnsTable = ColumnsTable<SourceSummary>;

/** The library table's columns, sized by TanStack Table and remembered in the view's layout. */
export function useLibraryColumns({
  sources,
  layout,
  onLayoutChange,
  properties,
}: {
  readonly sources: readonly SourceSummary[];
  readonly layout: LibraryLayout;
  readonly onLayoutChange: (layout: LibraryLayout) => void;
  readonly properties: readonly { readonly key: string; readonly label?: string }[];
}): LibraryColumnsTable {
  const columns = useMemo(
    () =>
      layout.columns.map((column) => ({
        id: column,
        header: columnLabel(column, properties),
        size: defaultColumnWidth(column),
      })),
    [layout.columns, properties],
  );
  return useTableColumns({
    rows: sources,
    columns,
    columnWidths: layout.columnWidths,
    onWidthsChange: (columnWidths) => onLayoutChange({ ...layout, columnWidths }),
    getRowId: (source) => source.id,
  });
}

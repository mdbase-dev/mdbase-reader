import {
  columnResizingFeature,
  columnSizingFeature,
  createColumnHelper,
  tableFeatures,
  useTable,
  type ColumnSizingState,
  type ReactTable,
  type columnResizingState,
} from "@tanstack/react-table";
import { useEffect, useEffectEvent, useMemo, useState } from "react";

import {
  columnLabel,
  defaultColumnWidth,
  maximumColumnWidth,
  minimumColumnWidth,
} from "./library-columns.js";

import type { LibraryLayout } from "./use-library-layout-draft.js";
import type { SourceSummary } from "@mdbase-reader/core";

const features = tableFeatures({ columnSizingFeature, columnResizingFeature });
const helper = createColumnHelper<typeof features, SourceSummary>();

interface ColumnState {
  readonly columnSizing: ColumnSizingState;
  readonly columnResizing: columnResizingState;
}
export type LibraryColumnsTable = ReactTable<typeof features, SourceSummary, ColumnState>;

/**
 * TanStack Table owns column sizes while a column is being dragged; the settled widths are
 * written back to the layout, so a drag is one layout change rather than hundreds. Sizes are read
 * from the layout once: a caller that replaces widths wholesale (a reset) remounts the table.
 */
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
  const columnDefs = useMemo(
    () =>
      layout.columns.map((column) =>
        helper.display({
          id: column,
          header: columnLabel(column, properties),
          size: defaultColumnWidth(column),
          minSize: minimumColumnWidth,
          maxSize: maximumColumnWidth,
        }),
      ),
    [layout.columns, properties],
  );
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => ({
    ...layout.columnWidths,
  }));
  const table = useTable(
    {
      features,
      columns: columnDefs,
      data: sources,
      getRowId: (row) => row.id,
      columnResizeMode: "onChange",
      state: { columnSizing },
      onColumnSizingChange: setColumnSizing,
    },
    (state): ColumnState => ({
      columnSizing: state.columnSizing,
      columnResizing: state.columnResizing,
    }),
  );
  const resizing = table.state.columnResizing.isResizingColumn;
  const commit = useEffectEvent((sizes: ColumnSizingState): void => {
    if (!sameWidths(sizes, layout.columnWidths)) {
      onLayoutChange({ ...layout, columnWidths: roundedWidths(sizes) });
    }
  });
  useEffect(() => {
    if (resizing === false) {
      commit(columnSizing);
    }
  }, [columnSizing, resizing]);
  return table;
}

export function clampWidth(width: number): number {
  return Math.round(Math.min(maximumColumnWidth, Math.max(minimumColumnWidth, width)));
}

function roundedWidths(sizes: ColumnSizingState): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.entries(sizes).map(([column, size]) => [column, clampWidth(size)]),
  );
}

function sameWidths(left: ColumnSizingState, right: Readonly<Record<string, number>>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => Math.round(left[key] ?? -1) === Math.round(right[key] ?? -1));
}

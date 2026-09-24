import {
  columnResizingFeature,
  columnSizingFeature,
  createColumnHelper,
  tableFeatures,
  useTable,
  type ColumnSizingState,
  type ReactTable,
  type RowData,
  type columnResizingState,
} from "@tanstack/react-table";
import { useEffect, useEffectEvent, useMemo, useState } from "react";

import { maximumColumnWidth, minimumColumnWidth } from "./library-columns.js";

const features = tableFeatures({ columnSizingFeature, columnResizingFeature });

interface ColumnState {
  readonly columnSizing: ColumnSizingState;
  readonly columnResizing: columnResizingState;
}
export type ColumnsTable<Row extends RowData> = ReactTable<typeof features, Row, ColumnState>;

export interface TableColumnSpec {
  readonly id: string;
  readonly header: string;
  /** The width before the reader resizes the column. */
  readonly size: number;
}

/**
 * TanStack Table owns column sizes while a column is being dragged; the settled widths are
 * written back through `onWidthsChange`, so a drag is one layout change rather than hundreds.
 * Widths are read once: a caller that replaces them wholesale (a reset) remounts the table.
 */
export function useTableColumns<Row extends RowData>({
  rows,
  columns,
  columnWidths,
  onWidthsChange,
  getRowId,
}: {
  readonly rows: readonly Row[];
  readonly columns: readonly TableColumnSpec[];
  readonly columnWidths: Readonly<Record<string, number>>;
  readonly onWidthsChange: (widths: Readonly<Record<string, number>>) => void;
  readonly getRowId: (row: Row) => string;
}): ColumnsTable<Row> {
  const columnDefs = useMemo(() => {
    const helper = createColumnHelper<typeof features, Row>();
    return columns.map(({ id, header, size }) =>
      helper.display({
        id,
        header,
        size,
        minSize: minimumColumnWidth,
        maxSize: maximumColumnWidth,
      }),
    );
  }, [columns]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => ({
    ...columnWidths,
  }));
  const table = useTable(
    {
      features,
      columns: columnDefs,
      data: rows,
      getRowId,
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
    if (!sameWidths(sizes, columnWidths)) {
      onWidthsChange(roundedWidths(sizes));
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

import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type RefObject,
} from "react";

import { defaultColumnWidth, type LibraryColumn } from "./library-columns.js";
import { handleGridKey } from "./library-grid-keys.js";
import {
  selectRow,
  selectionGesture,
  toggleTouchRow,
  type RowSelection,
} from "./library-row-selection.js";
import { useLibraryRowMenu, type LibraryRowMenuActions } from "./LibraryRowMenu.js";
import { LibraryTableHead } from "./LibraryTableHead.js";
import { LibraryTableRow, isEditableColumn } from "./LibraryTableRow.js";
import { useLibraryColumns } from "./use-library-columns.js";
import { hasModifier, useLongPress } from "./use-long-press.js";

import type { LibraryLayout } from "./use-library-layout-draft.js";
import type { ReadingStatus, SourceId, SourceSummary } from "@mdbase-reader/core";

export const libraryRowHeight = 52;
const headerHeight = 34;

export interface LibraryTableProps {
  readonly sources: readonly SourceSummary[];
  readonly layout: LibraryLayout;
  readonly onLayoutChange: (layout: LibraryLayout) => void;
  readonly properties: readonly { readonly key: string; readonly label?: string }[];
  readonly propertyKeys: readonly string[];
  readonly valuesByPath: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly annotationCounts: ReadonlyMap<SourceId, number>;
  readonly focused: boolean;
  readonly selection: RowSelection;
  readonly onSelectionChange: (selection: RowSelection) => void;
  /** The scrolling results pane; the table may sit below other content in it. */
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly onOpen: (id: SourceId) => void;
  readonly onOpenBeside: (id: SourceId) => void;
  readonly onChangeStatus?: (id: SourceId, status: ReadingStatus) => void;
  /** Saves a field edited in its cell; editing is offered only when this is present. */
  readonly onEditField?: (source: SourceSummary, key: string, text: string) => Promise<void>;
  readonly onExport?: (sources: readonly SourceSummary[]) => void;
}

interface EditingCell {
  readonly id: SourceId;
  readonly column: LibraryColumn;
}

export function LibraryTable(props: LibraryTableProps): JSX.Element {
  const { sources, layout, selection, onSelectionChange, scrollRef } = props;
  const gridRef = useRef<HTMLDivElement>(null);
  const table = useLibraryColumns(props);
  const rowIds = useMemo(() => sources.map(({ id }) => id), [sources]);
  const offset = useOffsetTop(gridRef);
  // TanStack Virtual returns fresh functions each render; the React Compiler must not memoize them.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: sources.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => libraryRowHeight,
    getItemKey: (index) => sources[index]?.id ?? index,
    overscan: 10,
    scrollPaddingStart: headerHeight,
    // Rows are measured from the top of the scroller; content above the table offsets them.
    scrollMargin: offset + headerHeight,
  });
  const focusRow = useRowFocus(gridRef);
  const press = useLongPress();
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const rowMenu = useLibraryRowMenu({
    sources,
    selection,
    rowIds,
    gridRef,
    onSelectionChange,
    onClosed: focusRow,
    actions: rowMenuActions(props, (source) => setEditing({ id: source.id, column: "title" })),
  });
  const sizes = layout.columns.map(
    (column) => table.getColumn(column)?.getSize() ?? defaultColumnWidth(column),
  );
  const gridTemplateColumns = `${sizes.map((size) => `${String(size)}px`).join(" ")} minmax(44px, 1fr)`;
  const width = sizes.reduce((total, size) => total + size, 0) + 60;
  const margin = offset + headerHeight;
  return (
    <div className="library-table-frame">
      <div
        ref={gridRef}
        className={`library-table${layout.columns.includes("creator") ? " has-creator-column" : ""}`}
        role="grid"
        tabIndex={-1}
        aria-label="Sources"
        aria-rowcount={sources.length + 1}
        aria-colcount={layout.columns.length}
        aria-multiselectable="true"
        style={{ minWidth: `${String(width)}px` }}
        onKeyDown={(event) => {
          if (
            (event.target as Element).closest("select, input, button, summary, [role=separator]") ||
            rowMenu.openFromKey(event) ||
            startCellEdit(event, props, selection.active, setEditing)
          ) {
            return;
          }
          handleGridKey(event, {
            rowIds,
            selection,
            pageSize: Math.max(
              1,
              Math.floor((scrollRef.current?.clientHeight ?? 400) / libraryRowHeight),
            ),
            moveTo: (index, next) => {
              focusRow(index);
              virtualizer.scrollToIndex(index, { align: "auto" });
              onSelectionChange(next);
            },
            onSelectionChange,
            open: props.onOpen,
            openBeside: props.onOpenBeside,
          });
        }}
      >
        <LibraryTableHead
          table={table}
          gridTemplateColumns={gridTemplateColumns}
          layout={layout}
          onLayoutChange={props.onLayoutChange}
          properties={props.properties}
          propertyKeys={props.propertyKeys}
        />
        <div
          role="rowgroup"
          className="library-table-body"
          style={{ height: `${String(virtualizer.getTotalSize())}px` }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const source = sources[item.index];
            return source ? (
              <LibraryTableRow
                key={source.id}
                {...props}
                source={source}
                index={item.index}
                top={item.start - margin}
                gridTemplateColumns={gridTemplateColumns}
                tabbable={props.focused && item.index === (selection.active ?? 0)}
                editing={editing?.id === source.id ? editing.column : null}
                onEditCell={(column) => setEditing({ id: source.id, column })}
                onEditDone={() => {
                  setEditing(null);
                  focusRow(item.index);
                }}
                press={press}
                onMenu={(x, y) => rowMenu.open(item.index, x, y)}
                onLongPress={() => onSelectionChange(toggleTouchRow(selection, rowIds, item.index))}
                onSelect={(event) =>
                  onSelectionChange(
                    selection.touch && !hasModifier(event)
                      ? toggleTouchRow(selection, rowIds, item.index)
                      : selectRow(selection, rowIds, item.index, selectionGesture(event)),
                  )
                }
              />
            ) : null;
          })}
        </div>
      </div>
      {rowMenu.element}
    </div>
  );
}

/** F2 edits the focused row's first editable field, like renaming in a file manager. */
function startCellEdit(
  event: { readonly key: string; preventDefault: () => void },
  props: LibraryTableProps,
  active: number | null,
  setEditing: (cell: EditingCell) => void,
): boolean {
  const column = props.layout.columns.find(isEditableColumn);
  const source = active === null ? undefined : props.sources[active];
  if (event.key !== "F2" || !props.onEditField || !column || !source) {
    return false;
  }
  event.preventDefault();
  setEditing({ id: source.id, column });
  return true;
}

function rowMenuActions(
  props: LibraryTableProps,
  rename: (source: SourceSummary) => void,
): LibraryRowMenuActions {
  return {
    onOpen: props.onOpen,
    onOpenBeside: props.onOpenBeside,
    ...(props.onChangeStatus ? { onChangeStatus: props.onChangeStatus } : {}),
    ...(props.onExport ? { onExport: props.onExport } : {}),
    ...(props.onEditField && props.layout.columns.includes("title") ? { onRename: rename } : {}),
  };
}

/** The element's offset within its scroller, re-read after every render that may move it. */
export function useOffsetTop(ref: RefObject<HTMLElement | null>): number {
  const [offset, setOffset] = useState(0);
  // Content above the table (Continue reading, a problem banner) can change on any render, so
  // this re-reads after every render; the equality guard stops it from looping.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const next = ref.current?.offsetTop ?? 0;
    if (next !== offset) {
      setOffset(next);
    }
  });
  return offset;
}

/** Focuses a row once it has rendered, after keyboard travel scrolls it into view. */
function useRowFocus(gridRef: RefObject<HTMLElement | null>): (index: number) => void {
  const [request, setRequest] = useState<{ readonly index: number } | null>(null);
  useEffect(() => {
    if (!request) {
      return undefined;
    }
    const frame = requestAnimationFrame(() =>
      gridRef.current
        ?.querySelector<HTMLElement>(`[data-row-index="${String(request.index)}"]`)
        ?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [gridRef, request]);
  return (index) => setRequest({ index });
}

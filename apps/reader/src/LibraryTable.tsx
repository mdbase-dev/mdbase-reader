import { useLingui } from "@lingui/react/macro";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type MouseEvent,
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
import { libraryPartKey } from "./library-source-parts.js";
import { useLibraryRowMenu, type LibraryRowMenuActions } from "./LibraryRowMenu.js";
import { LibraryTableHead } from "./LibraryTableHead.js";
import { LibraryTableRow, isEditableColumn } from "./LibraryTableRow.js";
import { useSourcePartCreation } from "./SourcePartCreation.js";
import { useLibraryColumns } from "./use-library-columns.js";
import { hasModifier, useLongPress } from "./use-long-press.js";
import { useMediaQuery } from "./use-media-query.js";

import type { LibraryPartRow } from "./library-source-parts.js";
import type { LibraryLayout } from "./use-library-layout-draft.js";
import type { ReadingStatus, SourceId, SourceSummary } from "@mdbase-reader/core";

export const libraryRowHeight = 48;
const headerHeight = 32;

export interface LibraryTableProps {
  readonly sources: readonly SourceSummary[];
  readonly rowIds: readonly SourceId[];
  readonly partRows?: ReadonlyMap<SourceId, LibraryPartRow>;
  readonly onTogglePart?: (id: SourceId) => void;
  readonly layout: LibraryLayout;
  readonly onLayoutChange: (layout: LibraryLayout) => void;
  readonly properties: readonly { readonly key: string; readonly label?: string }[];
  readonly propertyKeys: readonly string[];
  readonly valuesByPath: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly annotationCounts: ReadonlyMap<SourceId, number> | null;
  readonly focused: boolean;
  readonly selection: RowSelection;
  readonly onSelectionChange: (selection: RowSelection) => void;
  /** The table's scrolling frame. */
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly onOpen: (id: SourceId) => void;
  readonly onOpenBeside: (id: SourceId) => void;
  readonly onChangeStatus?: (source: SourceSummary, status: ReadingStatus) => void;
  /** Saves a field edited in its cell; editing is offered only when this is present. */
  readonly onEditField?: (source: SourceSummary, key: string, text: string) => Promise<void>;
  readonly onExport?: (sources: readonly SourceSummary[]) => void;
  /** Asks to remove a source, which confirms before anything is deleted. */
  readonly onRemove?: (source: SourceSummary) => void;
}

interface EditingCell {
  readonly id: SourceId;
  readonly column: LibraryColumn;
}

// Keep the virtualized grid, existing editing, and disclosure keyboard handling in one owner.
export function LibraryTable(props: LibraryTableProps): JSX.Element {
  const { t } = useLingui();
  const { sources, rowIds, layout, selection, onSelectionChange, scrollRef } = props;
  const rowHeight = useMediaQuery("(max-width: 680px)") ? 76 : libraryRowHeight;
  const gridRef = useRef<HTMLDivElement>(null);
  const table = useLibraryColumns(props);
  const getItemKey = useCallback((index: number) => sources[index]?.id ?? index, [sources]);
  // TanStack Virtual returns fresh functions each render; the React Compiler must not memoize them.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: sources.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    getItemKey,
    overscan: 10,
    scrollPaddingStart: headerHeight,
    scrollMargin: headerHeight,
  });
  const previousRowHeight = useRef(rowHeight);
  useLayoutEffect(() => {
    if (previousRowHeight.current !== rowHeight) {
      previousRowHeight.current = rowHeight;
      virtualizer.measure();
    }
  }, [virtualizer, rowHeight]);
  const focusRow = useRowFocus(gridRef, sources);
  const press = useLongPress();
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const createChapters = useSourcePartCreation();
  const rowMenu = useLibraryRowMenu({
    sources,
    selection,
    rowIds,
    gridRef,
    onSelectionChange,
    onClosed: focusRow,
    actions: rowMenuActions(
      props,
      (source) => setEditing({ id: source.id, column: "title" }),
      createChapters,
    ),
  });
  const editCell = useCallback((source: SourceSummary, column: LibraryColumn): void => {
    setEditing({ id: source.id, column });
  }, []);
  const finishEditing = useCallback(
    (index: number): void => {
      setEditing(null);
      focusRow(index);
    },
    [focusRow],
  );
  const longPress = useCallback(
    (index: number): void => {
      onSelectionChange(toggleTouchRow(selection, rowIds, index));
    },
    [onSelectionChange, rowIds, selection],
  );
  const select = useCallback(
    (index: number, event: MouseEvent<HTMLElement>): void => {
      onSelectionChange(
        selection.touch && !hasModifier(event)
          ? toggleTouchRow(selection, rowIds, index)
          : selectRow(selection, rowIds, index, selectionGesture(event)),
      );
    },
    [onSelectionChange, rowIds, selection],
  );
  const sizes = layout.columns.map(
    (column) => table.getColumn(column)?.getSize() ?? defaultColumnWidth(column),
  );
  const gridTemplateColumns = `${sizes.map((size) => `${String(size)}px`).join(" ")} minmax(44px, 1fr)`;
  const width = sizes.reduce((total, size) => total + size, 0) + 60;
  useLayoutEffect(() => {
    const frame = scrollRef.current;
    if (!frame) {
      return undefined;
    }
    let scrollEnd = 0;
    const updateClipping = (): void => {
      const clipped = String(scrollEnd - frame.scrollLeft > 1);
      if (frame.dataset["clipped"] !== clipped) {
        frame.dataset["clipped"] = clipped;
      }
    };
    const measure = (): void => {
      scrollEnd = frame.scrollWidth - frame.clientWidth;
      updateClipping();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    if (gridRef.current) {
      observer.observe(gridRef.current);
    }
    frame.addEventListener("scroll", updateClipping, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      frame.removeEventListener("scroll", updateClipping);
    };
  }, [scrollRef, width]);
  return (
    <div ref={scrollRef} className="library-table-frame">
      <div
        ref={gridRef}
        id={props.focused ? "reader-library-grid" : undefined}
        className={`library-table${layout.columns.includes("creator") ? " has-creator-column" : ""}${layout.columns.includes("format") ? " has-format-column" : ""}`}
        role={props.partRows ? "treegrid" : "grid"}
        tabIndex={-1}
        aria-label={t({ message: "Sources", context: "LibraryTable interface" })}
        aria-rowcount={sources.length + 1}
        aria-colcount={layout.columns.length + 1}
        aria-multiselectable="true"
        data-active-row={selection.active ?? undefined}
        style={{ minWidth: `${String(width)}px` }}
        onFocus={(event) => {
          const row = (event.target as Element).closest<HTMLElement>("[data-row-index]");
          if (row) {
            const index = Number(row.dataset["rowIndex"]);
            if (selection.active !== index) {
              onSelectionChange({ ...selection, active: index });
            }
          }
        }}
        onKeyDown={(event) => {
          if (
            (event.target as Element).closest("select, input, button, summary, [role=separator]") ||
            rowMenu.openFromKey(event) ||
            startCellEdit(event, props, selection.active, setEditing)
          ) {
            return;
          }
          if (sourceActionKey(event, props, gridRef.current)) {
            return;
          }
          if (
            handlePartGridKey(event, props, (index) => {
              focusRow(index);
              virtualizer.scrollToIndex(index, { align: "auto" });
              onSelectionChange(selectRow(selection, rowIds, index, "replace"));
            })
          ) {
            return;
          }
          handleGridKey(event, {
            rowIds,
            selection,
            pageSize: Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / rowHeight)),
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
                top={item.start - headerHeight}
                gridTemplateColumns={gridTemplateColumns}
                tabbable={props.focused && item.index === (selection.active ?? 0)}
                editing={editing?.id === source.id ? editing.column : null}
                onEditCell={editCell}
                onEditDone={finishEditing}
                press={press}
                onMenu={rowMenu.open}
                onLongPress={longPress}
                onSelect={select}
              />
            ) : null;
          })}
        </div>
      </div>
      {rowMenu.element}
    </div>
  );
}

function sourceActionKey(
  event: React.KeyboardEvent,
  props: LibraryTableProps,
  grid: HTMLElement | null,
): boolean {
  const index = sourceActionIndex(event.target as Element, props.selection.active);
  const source = props.sources[index];
  if (event.ctrlKey || event.metaKey || event.altKey || !source) {
    return false;
  }
  const key = event.key.toLowerCase();
  if (key === "delete" && props.onRemove) {
    event.preventDefault();
    props.onRemove(source);
  } else if (key === "e" && props.onExport) {
    event.preventDefault();
    props.onExport([source]);
  } else if (key === "s" && props.onChangeStatus) {
    event.preventDefault();
    openStatusPicker(grid, index);
  } else {
    return false;
  }
  return true;
}

function openStatusPicker(grid: HTMLElement | null, index: number): void {
  const picker = grid?.querySelector<HTMLElement>(
    `[data-row-index="${String(index)}"] .library-status button`,
  );
  if (picker && grid?.parentElement) {
    const frame = grid.parentElement;
    const visible = frame.getBoundingClientRect();
    const bounds = picker.getBoundingClientRect();
    frame.scrollBy({
      left:
        Math.min(0, bounds.left - Math.max(0, visible.left)) +
        Math.max(0, bounds.right - Math.min(window.innerWidth, visible.right)),
      top:
        Math.min(0, bounds.top - Math.max(0, visible.top)) +
        Math.max(0, bounds.bottom - Math.min(window.innerHeight, visible.bottom)),
      behavior: "instant",
    });
  }
  picker?.focus({ preventScroll: true });
  picker?.click();
}

function sourceActionIndex(target: Element, active: number | null): number {
  const row = target.closest<HTMLElement>("[data-row-index]");
  return row ? Number(row.dataset["rowIndex"]) : (active ?? 0);
}

function handlePartGridKey(
  event: { readonly key: string; preventDefault: () => void },
  props: LibraryTableProps,
  move: (index: number) => void,
): boolean {
  const { sources, selection } = props;
  const source = sources[selection.active ?? 0];
  const action = source && libraryPartKey(event.key, source, props.partRows?.get(source.id));
  if (!source || !action) {
    return false;
  }
  event.preventDefault();
  if (action === "expand" || action === "collapse") {
    props.onTogglePart?.(source.id);
  } else {
    const index =
      action === "child"
        ? (selection.active ?? 0) + 1
        : sources.findIndex(({ id }) => id === source.partOf);
    if (index >= 0 && index < sources.length) {
      move(index);
    }
  }
  return true;
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
  createChapters: ((source: SourceSummary) => void) | null,
): LibraryRowMenuActions {
  return {
    ...(createChapters ? { onCreateChapters: createChapters } : {}),
    onOpen: props.onOpen,
    onOpenBeside: props.onOpenBeside,
    ...(props.onChangeStatus ? { onChangeStatus: props.onChangeStatus } : {}),
    ...(props.onRemove ? { onRemove: props.onRemove } : {}),
    ...(props.onEditField && props.layout.columns.includes("title") ? { onRename: rename } : {}),
  };
}

/** Focuses a row once it has rendered, after keyboard travel scrolls it into view. */
function useRowFocus(
  gridRef: RefObject<HTMLElement | null>,
  sources: readonly SourceSummary[],
): (index: number) => void {
  const pending = useRef<{ index: number; id: SourceId } | null>(null);
  // A virtual scroll can mount the destination several commits after the key event.
  useLayoutEffect(() => {
    const target = pending.current;
    if (!target) {
      return;
    }
    if (sources[target.index]?.id !== target.id) {
      pending.current = null;
      return;
    }
    const row = gridRef.current?.querySelector<HTMLElement>(
      `[data-row-index="${String(target.index)}"]`,
    );
    if (row) {
      pending.current = null;
      row.focus({ preventScroll: true });
    }
  });
  return useCallback(
    (index: number) => {
      const source = sources[index];
      pending.current = source ? { index, id: source.id } : null;
    },
    [sources],
  );
}

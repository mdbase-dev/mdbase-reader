import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, type JSX, type KeyboardEvent, type RefObject } from "react";

import { handleGridKey } from "./library-grid-keys.js";
import {
  selectRow,
  selectionGesture,
  toggleTouchRow,
  type RowSelection,
} from "./library-row-selection.js";
import { AnnotationRow } from "./LibraryAnnotationRow.js";
import { AnnotationTableHead, useAnnotationColumns } from "./LibraryAnnotationTableHead.js";
import { useOffsetTop } from "./LibraryTable.js";
import { hasModifier, useLongPress } from "./use-long-press.js";

import type { AnnotationEntry } from "./annotation-overview.js";
import type { AnnotationLayout } from "./mdbase-annotation-views.js";
import type { Annotation, AnnotationId } from "@mdbase-reader/core";

// An estimate until each row is measured; rows size to their passage.
const rowHeight = 64;
const headerHeight = 34;

export function AnnotationTable({
  entries,
  rowIds,
  layout,
  onLayoutChange,
  selection,
  onSelectionChange,
  focused,
  scrollRef,
  onOpen,
}: {
  readonly entries: readonly AnnotationEntry[];
  readonly rowIds: readonly AnnotationId[];
  readonly layout: AnnotationLayout;
  readonly onLayoutChange: (layout: AnnotationLayout) => void;
  readonly selection: RowSelection<AnnotationId>;
  readonly onSelectionChange: (selection: RowSelection<AnnotationId>) => void;
  readonly focused: boolean;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly onOpen: (annotation: Annotation, beside: boolean) => void;
}): JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null);
  const offset = useOffsetTop(gridRef);
  const press = useLongPress();
  const { table, gridTemplateColumns, width } = useAnnotationColumns(
    entries,
    layout,
    onLayoutChange,
  );
  // TanStack Virtual returns fresh functions each render; the React Compiler must not memoize them.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    getItemKey: (index) => entries[index]?.annotation.id ?? index,
    overscan: 8,
    scrollPaddingStart: headerHeight,
    scrollMargin: offset + headerHeight,
  });
  const open = openById(entries, onOpen);
  return (
    <div className="library-table-frame">
      <div
        ref={gridRef}
        className="library-table library-annotation-table"
        role="grid"
        tabIndex={-1}
        aria-label="Annotations"
        aria-rowcount={entries.length + 1}
        aria-colcount={layout.columns.length}
        aria-multiselectable="true"
        style={{ minWidth: `${String(width)}px` }}
        onKeyDown={(event) =>
          unlessInControl(event, () =>
            handleGridKey(event, {
              rowIds,
              selection,
              pageSize: Math.max(
                1,
                Math.floor((scrollRef.current?.clientHeight ?? 400) / rowHeight),
              ),
              moveTo: (index, next) => {
                virtualizer.scrollToIndex(index, { align: "auto" });
                onSelectionChange(next);
                focusRowSoon(gridRef.current, index);
              },
              onSelectionChange,
              open: (id) => open(id, false),
              openBeside: (id) => open(id, true),
            }),
          )
        }
      >
        <AnnotationTableHead
          table={table}
          gridTemplateColumns={gridTemplateColumns}
          layout={layout}
          onLayoutChange={onLayoutChange}
        />
        <div
          role="rowgroup"
          className="library-table-body"
          style={{ height: `${String(virtualizer.getTotalSize())}px` }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const entry = entries[item.index];
            return entry ? (
              <AnnotationRow
                key={entry.annotation.id}
                entry={entry}
                columns={layout.columns}
                gridTemplateColumns={gridTemplateColumns}
                index={item.index}
                top={item.start - offset - headerHeight}
                tabbable={focused && item.index === (selection.active ?? 0)}
                selected={selection.ids.has(entry.annotation.id)}
                touchSelecting={selection.touch === true}
                press={press}
                onLongPress={() => onSelectionChange(toggleTouchRow(selection, rowIds, item.index))}
                onSelect={(event) =>
                  onSelectionChange(
                    selection.touch && !hasModifier(event)
                      ? toggleTouchRow(selection, rowIds, item.index)
                      : selectRow(selection, rowIds, item.index, selectionGesture(event)),
                  )
                }
                onOpen={() => onOpen(entry.annotation, false)}
                measure={virtualizer.measureElement}
              />
            ) : null;
          })}
        </div>
      </div>
    </div>
  );
}

/** Header controls (menus, resizers) handle their own keys; the grid handles the rest. */
function unlessInControl(event: KeyboardEvent, act: () => void): void {
  if (!(event.target as Element).closest("select, input, button, summary, [role=separator]")) {
    act();
  }
}

/** Focuses a row on the next frame, once scrolling to it has rendered it. */
function focusRowSoon(grid: HTMLElement | null, index: number): void {
  requestAnimationFrame(() =>
    grid
      ?.querySelector<HTMLElement>(`[data-row-index="${String(index)}"]`)
      ?.focus({ preventScroll: true }),
  );
}

function openById(
  entries: readonly AnnotationEntry[],
  onOpen: (annotation: Annotation, beside: boolean) => void,
): (id: AnnotationId, beside: boolean) => void {
  const byId = new Map(entries.map((entry) => [entry.annotation.id, entry.annotation]));
  return (id, beside) => {
    const annotation = byId.get(id);
    if (annotation) {
      onOpen(annotation, beside);
    }
  };
}

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, type JSX, type MouseEvent, type RefObject } from "react";

import { handleGridKey } from "./library-grid-keys.js";
import { selectRow, selectionGesture, type RowSelection } from "./library-row-selection.js";
import { relativeDay } from "./LibraryCells.js";
import { useOffsetTop } from "./LibraryTable.js";

import type { AnnotationEntry } from "./annotation-overview.js";
import type { Annotation, AnnotationId } from "@mdbase-reader/core";

const rowHeight = 78;
const headerHeight = 34;
const gridTemplateColumns =
  "minmax(280px, 2.4fr) minmax(180px, 1fr) 96px minmax(100px, 0.6fr) 140px 96px";

export function AnnotationTable({
  entries,
  rowIds,
  selection,
  onSelectionChange,
  focused,
  scrollRef,
  onOpen,
}: {
  readonly entries: readonly AnnotationEntry[];
  readonly rowIds: readonly AnnotationId[];
  readonly selection: RowSelection<AnnotationId>;
  readonly onSelectionChange: (selection: RowSelection<AnnotationId>) => void;
  readonly focused: boolean;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly onOpen: (annotation: Annotation, beside: boolean) => void;
}): JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null);
  const offset = useOffsetTop(gridRef);
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
  const byId = new Map(entries.map((entry) => [entry.annotation.id, entry.annotation]));
  const open = (id: AnnotationId, beside: boolean): void => {
    const annotation = byId.get(id);
    if (annotation) {
      onOpen(annotation, beside);
    }
  };
  return (
    <div
      ref={gridRef}
      className="library-table library-annotation-table"
      role="grid"
      tabIndex={-1}
      aria-label="Annotations"
      aria-rowcount={entries.length + 1}
      aria-multiselectable="true"
      onKeyDown={(event) =>
        handleGridKey(event, {
          rowIds,
          selection,
          pageSize: Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / rowHeight)),
          moveTo: (index, next) => {
            virtualizer.scrollToIndex(index, { align: "auto" });
            onSelectionChange(next);
            requestAnimationFrame(() =>
              gridRef.current
                ?.querySelector<HTMLElement>(`[data-row-index="${String(index)}"]`)
                ?.focus({ preventScroll: true }),
            );
          },
          onSelectionChange,
          open: (id) => open(id, false),
          openBeside: (id) => open(id, true),
        })
      }
    >
      <div role="rowgroup" className="library-table-head">
        <div
          className="library-table-row is-header"
          role="row"
          aria-rowindex={1}
          style={{ gridTemplateColumns }}
        >
          {["Passage", "Source", "Type", "Tags", "Location", "Created"].map((label) => (
            <span key={label} role="columnheader" className="library-column-header">
              <span className="library-column-label">{label}</span>
            </span>
          ))}
        </div>
      </div>
      <div
        role="rowgroup"
        className="library-table-body"
        style={{ height: `${String(virtualizer.getTotalSize())}px` }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const entry = entries[item.index];
          if (!entry) {
            return null;
          }
          return (
            <AnnotationRow
              key={entry.annotation.id}
              entry={entry}
              index={item.index}
              top={item.start - offset - headerHeight}
              tabbable={focused && item.index === (selection.active ?? 0)}
              selected={selection.ids.has(entry.annotation.id)}
              onSelect={(event) =>
                onSelectionChange(selectRow(selection, rowIds, item.index, selectionGesture(event)))
              }
              onOpen={() => onOpen(entry.annotation, false)}
            />
          );
        })}
      </div>
    </div>
  );
}

function AnnotationRow({
  entry,
  index,
  top,
  tabbable,
  selected,
  onSelect,
  onOpen,
}: {
  readonly entry: AnnotationEntry;
  readonly index: number;
  readonly top: number;
  readonly tabbable: boolean;
  readonly selected: boolean;
  readonly onSelect: (event: MouseEvent<HTMLElement>) => void;
  readonly onOpen: () => void;
}): JSX.Element {
  const { annotation, source, quote, note } = entry;
  return (
    // Rows take keyboard input through the grid's roving focus; see handleGridKey.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      className={`library-table-row library-annotation-row${selected ? " is-selected" : ""}`}
      role="row"
      aria-rowindex={index + 2}
      aria-selected={selected}
      data-row-index={index}
      tabIndex={tabbable ? 0 : -1}
      title="Double-click or press Enter to open in its document"
      style={{
        gridTemplateColumns,
        transform: `translateY(${String(top)}px)`,
      }}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <span role="gridcell" className="library-annotation-passage">
        {quote ? <q>{quote}</q> : null}
        {note ? <span>{note}</span> : null}
      </span>
      <span role="gridcell">
        <span className="library-title-copy">
          <strong>{source?.title ?? "Unknown source"}</strong>
          <small>{source?.creators.join(", ") ?? ""}</small>
        </span>
      </span>
      <span role="gridcell" className={`annotation-kind is-${annotation.annotationType}`}>
        {annotation.annotationType.charAt(0).toLocaleUpperCase() +
          annotation.annotationType.slice(1)}
      </span>
      <span role="gridcell" className="library-property-value">
        {annotation.tags.join(", ") || <span className="library-empty-value">—</span>}
      </span>
      <span role="gridcell">{annotation.locator?.label ?? "—"}</span>
      <span role="gridcell">
        <time dateTime={annotation.createdAt}>{relativeDay(annotation.createdAt)}</time>
      </span>
    </div>
  );
}

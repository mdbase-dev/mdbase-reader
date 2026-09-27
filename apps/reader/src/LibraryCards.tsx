import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type MouseEvent,
  type RefObject,
} from "react";

import { publicationDateLabel } from "./library-publication-date.js";
import {
  selectRow,
  selectionGesture,
  toggleTouchRow,
  type RowSelection,
} from "./library-row-selection.js";
import { ReadingStatus, formatLabel } from "./LibraryCells.js";
import { useOffsetTop } from "./LibraryTable.js";
import { sourceFormat } from "./mdbase-library-views.js";
import { hasModifier, itemClick, useLongPress, type LongPress } from "./use-long-press.js";

import type { SourceId, SourceSummary } from "@mdbase-reader/core";

const cardHeight = 270;
const cardGap = 16;
const minimumCardWidth = 220;
const gridPadding = 24;

/** Cards are virtualized a row at a time; every card has the same height. */
export function LibraryCards({
  sources,
  selection,
  onSelectionChange,
  onOpen,
  scrollRef,
}: {
  readonly sources: readonly SourceSummary[];
  readonly selection: RowSelection;
  readonly onSelectionChange: (selection: RowSelection) => void;
  readonly onOpen: (id: SourceId) => void;
  /** The scrolling results pane; cards may sit below other content in it. */
  readonly scrollRef: RefObject<HTMLDivElement | null>;
}): JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(scrollRef);
  const offset = useOffsetTop(gridRef);
  const press = useLongPress();
  const perRow = Math.max(
    1,
    Math.floor((width - gridPadding * 2 + cardGap) / (minimumCardWidth + cardGap)),
  );
  const rowCount = Math.ceil(sources.length / perRow);
  const rowIds = useMemo(() => sources.map(({ id }) => id), [sources]);
  // TanStack Virtual returns fresh functions each render; the React Compiler must not memoize them.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => cardHeight + cardGap,
    overscan: 3,
    paddingStart: gridPadding,
    paddingEnd: gridPadding,
    scrollMargin: offset,
  });
  return (
    <div className="library-card-frame">
      <div
        ref={gridRef}
        className="library-card-grid is-virtual"
        role="list"
        aria-label="Sources"
        style={{ height: `${String(virtualizer.getTotalSize())}px` }}
      >
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            className="library-card-row"
            style={{
              gridTemplateColumns: `repeat(${String(perRow)}, minmax(0, 1fr))`,
              transform: `translateY(${String(item.start - offset)}px)`,
            }}
          >
            {sources.slice(item.index * perRow, (item.index + 1) * perRow).map((source, offset) => {
              const index = item.index * perRow + offset;
              return (
                <LibraryCard
                  key={source.id}
                  source={source}
                  selected={selection.ids.has(source.id)}
                  press={press}
                  touchSelecting={selection.touch === true}
                  onLongPress={() => onSelectionChange(toggleTouchRow(selection, rowIds, index))}
                  onSelect={(event) =>
                    onSelectionChange(
                      selection.touch && !hasModifier(event)
                        ? toggleTouchRow(selection, rowIds, index)
                        : selectRow(selection, rowIds, index, selectionGesture(event)),
                    )
                  }
                  onOpen={() => onOpen(source.id)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function LibraryCard({
  source,
  selected,
  onSelect,
  press,
  touchSelecting,
  onLongPress,
  onOpen,
}: {
  readonly source: SourceSummary;
  readonly selected: boolean;
  readonly onSelect: (event: MouseEvent<HTMLElement>) => void;
  readonly press: LongPress;
  readonly touchSelecting: boolean;
  readonly onLongPress: () => void;
  readonly onOpen: () => void;
}): JSX.Element {
  return (
    <article className={`library-card${selected ? " is-selected" : ""}`} role="listitem">
      <button
        type="button"
        className="library-card-hit-target"
        aria-label={`Select ${source.title}`}
        aria-pressed={selected}
        {...press.bind(onLongPress)}
        onClick={(event) => {
          const action = itemClick(press, event, touchSelecting);
          if (action === "open") {
            onOpen();
          } else if (action === "select") {
            onSelect(event);
          }
        }}
        onDoubleClick={() => {
          // A tap has already opened the source; while selecting by touch, a second tap toggles.
          if (!touchSelecting && !press.touched()) {
            onOpen();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            onOpen();
          }
        }}
      />
      <div className={`library-card-bookplate is-${sourceFormat(source)}`}>
        <span>{formatLabel(source)}</span>
        <strong aria-hidden="true">{source.title.trim().charAt(0).toLocaleUpperCase()}</strong>
      </div>
      <div className="library-card-copy">
        <span>{source.creators.join(", ") || "Unknown creator"}</span>
        <h3>{source.title}</h3>
        <div>
          <small>{publicationDateLabel(source.published) ?? "Undated"}</small>
          <ReadingStatus source={source} />
        </div>
        {source.tags.length > 0 ? <p>{source.tags.slice(0, 3).map(String).join(" · ")}</p> : null}
      </div>
    </article>
  );
}

function useElementWidth(ref: { readonly current: HTMLElement | null }): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry?.contentRect.width ?? element.clientWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

import { annotationKindLabel } from "./annotation-kind.js";
import { relativeDay } from "./LibraryCells.js";
import { itemClick, type LongPress } from "./use-long-press.js";

import type { AnnotationColumn } from "./annotation-columns.js";
import type { AnnotationEntry } from "./annotation-overview.js";
import type { JSX, MouseEvent } from "react";

export function AnnotationRow({
  entry,
  columns,
  gridTemplateColumns,
  index,
  top,
  tabbable,
  selected,
  touchSelecting,
  press,
  onLongPress,
  onSelect,
  onOpen,
  measure,
}: {
  readonly entry: AnnotationEntry;
  readonly columns: readonly AnnotationColumn[];
  readonly gridTemplateColumns: string;
  readonly index: number;
  readonly top: number;
  readonly tabbable: boolean;
  readonly selected: boolean;
  readonly touchSelecting: boolean;
  readonly press: LongPress;
  readonly onLongPress: () => void;
  readonly onSelect: (event: MouseEvent<HTMLElement>) => void;
  readonly onOpen: () => void;
  /** Reports the row's rendered height, so short passages do not leave tall empty rows. */
  readonly measure?: (element: HTMLElement | null) => void;
}): JSX.Element {
  return (
    // Rows take keyboard input through the grid's roving focus; see handleGridKey.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      ref={measure}
      data-index={index}
      className={`library-table-row library-annotation-row${selected ? " is-selected" : ""}`}
      role="row"
      aria-rowindex={index + 2}
      aria-selected={selected}
      data-row-index={index}
      tabIndex={tabbable ? 0 : -1}
      title="Double-click or press Enter to open in its document"
      style={{ gridTemplateColumns, transform: `translateY(${String(top)}px)` }}
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
        // A tap has already opened it; while selecting by touch, a second tap toggles.
        if (!touchSelecting && !press.touched()) {
          onOpen();
        }
      }}
    >
      {columns.map((column) => (
        <AnnotationCell
          key={column}
          column={column}
          entry={entry}
          creatorBeneath={!columns.includes("creator")}
        />
      ))}
    </div>
  );
}

function AnnotationCell({
  column,
  entry,
  creatorBeneath,
}: {
  readonly column: AnnotationColumn;
  readonly entry: AnnotationEntry;
  /** Without a Creator column, the source's creators sit beneath its title. */
  readonly creatorBeneath: boolean;
}): JSX.Element {
  return cells[column](entry, creatorBeneath);
}

const cells: Record<
  AnnotationColumn,
  (entry: AnnotationEntry, creatorBeneath: boolean) => JSX.Element
> = {
  passage: ({ quote, note }) => (
    <span role="gridcell" className="library-annotation-passage">
      {quote ? <q>{quote}</q> : null}
      {note ? <span>{note}</span> : null}
    </span>
  ),
  source: ({ source }, creatorBeneath) => (
    <span role="gridcell">
      <span className="library-title-copy">
        <strong>{source?.title ?? "Unknown source"}</strong>
        {creatorBeneath ? <small>{source?.creators.join(", ") ?? ""}</small> : null}
      </span>
    </span>
  ),
  creator: ({ source }) => <TextCell text={source?.creators.join(", ") ?? ""} />,
  type: ({ annotation }) => (
    <span role="gridcell" className={`annotation-kind is-${annotation.annotationType}`}>
      {annotationKindLabel(annotation.annotationType)}
    </span>
  ),
  tags: ({ annotation }) => <TextCell text={annotation.tags.join(", ")} />,
  location: ({ annotation }) => <TextCell text={annotation.locator?.label ?? ""} />,
  created: ({ annotation }) => (
    <span role="gridcell">
      <time dateTime={annotation.createdAt}>{relativeDay(annotation.createdAt)}</time>
    </span>
  ),
};

function TextCell({ text }: { readonly text: string }): JSX.Element {
  return (
    <span role="gridcell" className="library-property-value">
      {text ? text : <span className="library-empty-value">—</span>}
    </span>
  );
}

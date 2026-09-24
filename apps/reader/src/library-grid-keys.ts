import {
  navigationTarget,
  selectAllRows,
  selectRow,
  type RowSelection,
} from "./library-row-selection.js";

import type { SourceId } from "@mdbase-reader/core";
import type { KeyboardEvent } from "react";

export interface GridKeyContext<Id extends string = SourceId> {
  readonly rowIds: readonly Id[];
  readonly selection: RowSelection<Id>;
  readonly pageSize: number;
  /** Scrolls a row into view, focuses it, and applies the resulting selection. */
  readonly moveTo: (index: number, selection: RowSelection<Id>) => void;
  readonly onSelectionChange: (selection: RowSelection<Id>) => void;
  readonly open: (id: Id) => void;
  readonly openBeside: (id: Id) => void;
}

/**
 * Keyboard use of the library grid: arrows, j/k, Page and Home/End move (Shift extends),
 * Space toggles, Ctrl/⌘+A selects all, Escape keeps only the focused row, Enter opens.
 */
export function handleGridKey<Id extends string>(
  event: KeyboardEvent,
  context: GridKeyContext<Id>,
): void {
  if (!moveByKey(event, context)) {
    actOnKey(event, context);
  }
}

function moveByKey<Id extends string>(event: KeyboardEvent, context: GridKeyContext<Id>): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }
  const { rowIds, selection } = context;
  const target = navigationTarget(event.key, selection.active, rowIds.length, context.pageSize);
  if (target === null) {
    return false;
  }
  event.preventDefault();
  context.moveTo(
    target,
    selectRow(selection, rowIds, target, event.shiftKey ? "range" : "replace"),
  );
  return true;
}

function actOnKey<Id extends string>(event: KeyboardEvent, context: GridKeyContext<Id>): void {
  const { rowIds, selection } = context;
  const active = selection.active;
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.key.toLocaleLowerCase() === "a") {
    event.preventDefault();
    context.onSelectionChange(selectAllRows(rowIds, active));
    return;
  }
  if (active === null) {
    return;
  }
  if (event.key === "Escape" && selection.ids.size > 1) {
    event.stopPropagation();
    context.onSelectionChange(selectRow(selection, rowIds, active, "replace"));
  } else if (event.key === " ") {
    event.preventDefault();
    context.onSelectionChange(selectRow(selection, rowIds, active, "toggle"));
  } else if (event.key === "Enter") {
    const id = rowIds[active];
    if (id) {
      event.preventDefault();
      (modifier ? context.openBeside : context.open)(id);
    }
  }
}

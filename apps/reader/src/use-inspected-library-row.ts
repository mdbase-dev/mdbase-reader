import { useEffect } from "react";

import type { RowSelection } from "./library-row-selection.js";
import type { SourceId } from "@mdbase-reader/core";

/** Long enough that moving through rows with the keyboard loads only the row it stops on. */
export const inspectDelayMs = 150;

/**
 * The row the Notes pane should show: the selected row that has focus. With several rows
 * selected, that is the one clicked or moved to last; a focused row that was just deselected
 * (Ctrl/⌘-click) names nothing, and the pane keeps its source.
 */
export function inspectedRowId(
  rows: readonly SourceId[],
  selection: RowSelection,
): SourceId | null {
  const id = selection.active === null ? undefined : rows[selection.active];
  return id !== undefined && selection.ids.has(id) ? id : null;
}

/**
 * Shows a focused library tab's selected row in the Notes pane once focus settles. Clearing the
 * selection keeps the last source, and returning to the tab shows its selection again.
 */
export function useInspectedLibraryRow(
  rows: readonly SourceId[],
  selection: RowSelection,
  focused: boolean,
  onInspect: ((id: SourceId) => void) | undefined,
): void {
  const id = inspectedRowId(rows, selection);
  useEffect(() => {
    if (!focused || !id || !onInspect) {
      return;
    }
    const timer = setTimeout(() => onInspect(id), inspectDelayMs);
    return () => clearTimeout(timer);
  }, [focused, id, onInspect]);
}

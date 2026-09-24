import type { SourceId } from "@mdbase-reader/core";

/** Which library rows are selected, which one has focus, and where a Shift range starts. */
export interface RowSelection<Id extends string = SourceId> {
  readonly ids: ReadonlySet<Id>;
  /** Index of the row that has keyboard focus, in the current row order. */
  readonly active: number | null;
  /** Index a Shift+click or Shift+arrow range extends from. */
  readonly anchor: number | null;
  /** Entered by a long press: taps toggle rows until nothing is selected. */
  readonly touch?: boolean;
}

export const emptyRowSelection: RowSelection<never> = {
  ids: new Set(),
  active: null,
  anchor: null,
};

export type SelectionGesture = "replace" | "toggle" | "range";

/** The gesture a pointer or keyboard event asks for: Shift extends, Ctrl/⌘ toggles. */
export function selectionGesture(event: {
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}): SelectionGesture {
  if (event.shiftKey) {
    return "range";
  }
  return event.ctrlKey || event.metaKey ? "toggle" : "replace";
}

export function selectRow<Id extends string>(
  current: RowSelection<Id>,
  rows: readonly Id[],
  index: number,
  gesture: SelectionGesture,
): RowSelection<Id> {
  const id = rows[index];
  if (id === undefined) {
    return current;
  }
  if (gesture === "range") {
    const anchor = current.anchor ?? current.active ?? index;
    const [start, end] = anchor <= index ? [anchor, index] : [index, anchor];
    return { ids: new Set(rows.slice(start, end + 1)), active: index, anchor };
  }
  if (gesture === "toggle") {
    const ids = new Set(current.ids);
    if (ids.has(id)) {
      ids.delete(id);
    } else {
      ids.add(id);
    }
    return { ids, active: index, anchor: index };
  }
  return { ids: new Set([id]), active: index, anchor: index };
}

/** A long press, or a tap while selecting by touch: toggles the row and stays in touch mode. */
export function toggleTouchRow<Id extends string>(
  current: RowSelection<Id>,
  rows: readonly Id[],
  index: number,
): RowSelection<Id> {
  const next = selectRow(
    current.touch ? current : { ...current, ids: new Set<Id>() },
    rows,
    index,
    "toggle",
  );
  return next.ids.size > 0 ? { ...next, touch: true } : { ...next, touch: false };
}

export function selectAllRows<Id extends string>(
  rows: readonly Id[],
  active: number | null,
): RowSelection<Id> {
  return { ids: new Set(rows), active, anchor: active };
}

/** The row index a navigation key moves to, or null for keys that do not navigate. */
export function navigationTarget(
  key: string,
  current: number | null,
  count: number,
  pageSize: number,
): number | null {
  if (count === 0) {
    return null;
  }
  const from = current ?? -1;
  const step: Readonly<Record<string, number>> = {
    ArrowDown: 1,
    j: 1,
    ArrowUp: -1,
    k: -1,
    PageDown: pageSize,
    PageUp: -pageSize,
  };
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return count - 1;
  }
  const delta = step[key];
  if (delta === undefined) {
    return null;
  }
  return Math.max(0, Math.min(count - 1, (current === null && delta < 0 ? count : from) + delta));
}

/** Drops ids that are no longer visible, e.g. after filtering, and clamps the focus. */
export function pruneRowSelection<Id extends string>(
  current: RowSelection<Id>,
  rows: readonly Id[],
): RowSelection<Id> {
  if (current.ids.size === 0 && current.active === null) {
    return current;
  }
  const visible = new Set(rows);
  const ids = new Set([...current.ids].filter((id) => visible.has(id)));
  const clamp = (value: number | null): number | null =>
    value === null || rows.length === 0 ? null : Math.min(value, rows.length - 1);
  if (ids.size === current.ids.size && clamp(current.active) === current.active) {
    return current;
  }
  return {
    ids,
    active: clamp(current.active),
    anchor: clamp(current.anchor),
    ...(current.touch && ids.size > 0 ? { touch: true } : {}),
  };
}

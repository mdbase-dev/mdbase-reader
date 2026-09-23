import { sourceId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import {
  emptyRowSelection,
  navigationTarget,
  pruneRowSelection,
  selectRow,
  selectionGesture,
} from "./library-row-selection.js";

const rows = ["a", "b", "c", "d", "e"].map(sourceId);

describe("library row selection", () => {
  it("replaces, toggles and extends ranges from the anchor", () => {
    const one = selectRow(emptyRowSelection, rows, 1, "replace");
    expect([...one.ids]).toEqual([rows[1]]);
    const toggled = selectRow(one, rows, 3, "toggle");
    expect([...toggled.ids]).toEqual([rows[1], rows[3]]);
    const range = selectRow(toggled, rows, 0, "range");
    expect([...range.ids]).toEqual([rows[0], rows[1], rows[2], rows[3]]);
    expect(range.anchor).toBe(3);
    expect(selectRow(range, rows, 4, "range").ids.size).toBe(2);
  });

  it("maps modifier keys to gestures", () => {
    expect(selectionGesture({ shiftKey: true, ctrlKey: true, metaKey: false })).toBe("range");
    expect(selectionGesture({ shiftKey: false, ctrlKey: false, metaKey: true })).toBe("toggle");
    expect(selectionGesture({ shiftKey: false, ctrlKey: false, metaKey: false })).toBe("replace");
  });

  it("navigates by row, page and ends without leaving the list", () => {
    expect(navigationTarget("ArrowDown", null, 5, 10)).toBe(0);
    expect(navigationTarget("ArrowUp", null, 5, 10)).toBe(4);
    expect(navigationTarget("j", 4, 5, 10)).toBe(4);
    expect(navigationTarget("PageUp", 3, 5, 2)).toBe(1);
    expect(navigationTarget("End", 0, 5, 10)).toBe(4);
    expect(navigationTarget("x", 0, 5, 10)).toBeNull();
  });

  it("forgets rows that a filter hid", () => {
    const selected = selectRow(selectRow(emptyRowSelection, rows, 0, "replace"), rows, 4, "toggle");
    const pruned = pruneRowSelection(selected, rows.slice(0, 3));
    expect([...pruned.ids]).toEqual([rows[0]]);
    expect(pruned.active).toBe(2);
  });
});

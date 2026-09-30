// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { sourceId, type SourceId } from "@mdbase-reader/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyRowSelection, selectRow, type RowSelection } from "./library-row-selection.js";
import {
  inspectDelayMs,
  inspectedRowId,
  useInspectedLibraryRow,
} from "./use-inspected-library-row.js";

const rows = ["a", "b", "c", "d"].map((id) => sourceId(id));
const click = (current: RowSelection, index: number, gesture = "replace" as const): RowSelection =>
  selectRow(current, rows, index, gesture);

describe("the row the Notes pane shows", () => {
  it("is the focused row while it is selected", () => {
    expect(inspectedRowId(rows, emptyRowSelection)).toBeNull();
    expect(inspectedRowId(rows, click(emptyRowSelection, 1))).toBe("b");
    // A Shift range or Ctrl/⌘ additions show the row moved to last.
    const range = selectRow(click(emptyRowSelection, 0), rows, 2, "range");
    expect(inspectedRowId(rows, range)).toBe("c");
    const added = selectRow(click(emptyRowSelection, 0), rows, 3, "toggle");
    expect(inspectedRowId(rows, added)).toBe("d");
    // Deselecting the focused row with Ctrl/⌘ names nothing, so the pane keeps its source.
    expect(inspectedRowId(rows, selectRow(added, rows, 3, "toggle"))).toBeNull();
  });
});

describe("useInspectedLibraryRow", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const inspect = vi.fn<(id: SourceId) => void>();

  function Harness({
    selection,
    focused = true,
  }: {
    readonly selection: RowSelection;
    readonly focused?: boolean;
  }): null {
    useInspectedLibraryRow(rows, selection, focused, inspect);
    return null;
  }
  const render = async (selection: RowSelection, focused = true): Promise<void> => {
    await act(async () => root.render(<Harness selection={selection} focused={focused} />));
  };
  const wait = async (ms: number): Promise<void> => {
    await act(async () => vi.advanceTimersByTime(ms));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    inspect.mockClear();
    host = document.createElement("div");
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows a selected row once focus settles", async () => {
    await render(click(emptyRowSelection, 1));
    await wait(inspectDelayMs - 1);
    expect(inspect).not.toHaveBeenCalled();
    await wait(1);
    expect(inspect).toHaveBeenCalledExactlyOnceWith("b");
  });

  it("loads only the row that keyboard movement stops on", async () => {
    let selection = click(emptyRowSelection, 0);
    await render(selection);
    for (const index of [1, 2, 3]) {
      await wait(inspectDelayMs / 3);
      selection = click(selection, index);
      await render(selection);
    }
    await wait(inspectDelayMs);
    expect(inspect).toHaveBeenCalledExactlyOnceWith("d");
  });

  it("keeps the last source when the selection clears", async () => {
    await render(click(emptyRowSelection, 2));
    await wait(inspectDelayMs);
    await render(emptyRowSelection);
    await wait(inspectDelayMs);
    expect(inspect.mock.calls).toEqual([["c"]]);
  });

  it("follows only a focused tab, and shows its selection again on return", async () => {
    const selection = click(emptyRowSelection, 1);
    await render(selection, false);
    await wait(inspectDelayMs);
    expect(inspect).not.toHaveBeenCalled();
    await render(selection, true);
    await wait(inspectDelayMs);
    expect(inspect).toHaveBeenCalledExactlyOnceWith("b");
    // Rerenders with the same focused row do not reload it.
    await render({ ...selection });
    await wait(inspectDelayMs);
    expect(inspect).toHaveBeenCalledOnce();
  });
});

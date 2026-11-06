import { expect, it, vi } from "vitest";

import { handleGridKey } from "./library-grid-keys.js";

import type { KeyboardEvent } from "react";

it("moves the cursor without changing X selection, while Shift extends a range", () => {
  const moveTo = vi.fn();
  const context = {
    rowIds: ["first", "second", "third"],
    selection: { active: 0, anchor: 0, ids: new Set(["first"]) },
    pageSize: 10,
    moveTo,
    onSelectionChange: vi.fn(),
    open: vi.fn(),
    openBeside: vi.fn(),
  };
  const key = (shiftKey: boolean): KeyboardEvent =>
    ({ key: "j", shiftKey, preventDefault: vi.fn() }) as unknown as KeyboardEvent;
  handleGridKey(key(false), context);
  expect(moveTo).toHaveBeenLastCalledWith(1, { ...context.selection, active: 1 });
  handleGridKey(key(true), context);
  expect(moveTo).toHaveBeenLastCalledWith(1, {
    active: 1,
    anchor: 0,
    ids: new Set(["first", "second"]),
  });
});

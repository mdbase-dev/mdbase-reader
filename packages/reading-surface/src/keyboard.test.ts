import { describe, expect, it } from "vitest";

import { isSelectionShortcut } from "./keyboard.js";

function keyEvent(
  key: string,
  options: {
    readonly selected?: boolean;
    readonly inField?: boolean;
    readonly ctrlKey?: boolean;
  } = {},
): KeyboardEvent {
  return {
    key,
    isComposing: false,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: { closest: () => (options.inField ? {} : null) },
    view: { getSelection: () => ({ isCollapsed: !(options.selected ?? true) }) },
  } as unknown as KeyboardEvent;
}

describe("isSelectionShortcut", () => {
  it("claims H and C while text is selected", () => {
    expect(isSelectionShortcut(keyEvent("h"))).toBe(true);
    expect(isSelectionShortcut(keyEvent("C"))).toBe(true);
  });

  it("leaves keys alone without a selection", () => {
    expect(isSelectionShortcut(keyEvent("h", { selected: false }))).toBe(false);
  });

  it("never intercepts typing in a field", () => {
    expect(isSelectionShortcut(keyEvent("c", { inField: true }))).toBe(false);
  });

  it("leaves modified keys, including copy, to the page", () => {
    expect(isSelectionShortcut(keyEvent("c", { ctrlKey: true }))).toBe(false);
    expect(isSelectionShortcut(keyEvent("x"))).toBe(false);
  });
});

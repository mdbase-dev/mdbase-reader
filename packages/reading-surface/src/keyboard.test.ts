import { describe, expect, it } from "vitest";

import {
  claimFrameShortcut,
  forwardApplicationShortcut,
  isApplicationShortcut,
  isClaimedShortcut,
  isSelectionShortcut,
} from "./keyboard.js";

function keyEvent(
  key: string,
  options: {
    readonly selected?: boolean;
    readonly inField?: boolean;
    readonly ctrlKey?: boolean;
    readonly metaKey?: boolean;
  } = {},
): KeyboardEvent {
  return {
    key,
    isComposing: false,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
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

  it("claims 1 to 5 for the highlight colours while text is selected", () => {
    for (const key of ["1", "2", "3", "4", "5"]) {
      expect(isSelectionShortcut(keyEvent(key))).toBe(true);
    }
    expect(isSelectionShortcut(keyEvent("6"))).toBe(false);
    expect(isSelectionShortcut(keyEvent("1", { selected: false }))).toBe(false);
    expect(isSelectionShortcut(keyEvent("2", { inField: true }))).toBe(false);
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

describe("isClaimedShortcut", () => {
  const unselected = { selected: false } as const;

  it("forwards Undo only while the application claims it, and never from a field", () => {
    const host = {} as Document;
    const undo = keyEvent("z", { ...unselected, ctrlKey: true });
    expect(isApplicationShortcut(undo)).toBe(false);
    expect(isClaimedShortcut(undo, host)).toBe(false);
    const releaseColors = claimFrameShortcut(host, "colors");
    expect(isClaimedShortcut(undo, host)).toBe(false);
    const releaseUndo = claimFrameShortcut(host, "undo");
    expect(isClaimedShortcut(undo, host)).toBe(true);
    expect(isClaimedShortcut(keyEvent("z", { ctrlKey: true, inField: true }), host)).toBe(false);
    releaseUndo();
    releaseColors();
    expect(isClaimedShortcut(undo, host)).toBe(false);
  });

  it("forwards 1 to 5 without a selection while a highlight offers its colours", () => {
    const host = {} as Document;
    const release = claimFrameShortcut(host, "colors");
    expect(isClaimedShortcut(keyEvent("3", unselected), host)).toBe(true);
    expect(isClaimedShortcut(keyEvent("6", unselected), host)).toBe(false);
    expect(isClaimedShortcut(keyEvent("h", unselected), host)).toBe(false);
    expect(isClaimedShortcut(keyEvent("3", { ...unselected, ctrlKey: true }), host)).toBe(false);
    release();
    expect(isClaimedShortcut(keyEvent("3", unselected), host)).toBe(false);
  });

  it("keeps a shortcut claimed until every claim on it is released", () => {
    const host = {} as Document;
    const undo = keyEvent("z", { ...unselected, metaKey: true });
    const first = claimFrameShortcut(host, "undo");
    const second = claimFrameShortcut(host, "undo");
    first();
    first();
    expect(isClaimedShortcut(undo, host)).toBe(true);
    second();
    expect(isClaimedShortcut(undo, host)).toBe(false);
  });
});

describe("forwardApplicationShortcut", () => {
  it("forwards claimed keys to the host and stops when the claim ends", () => {
    const received: string[] = [];
    const host = {
      defaultView: { KeyboardEvent: class extends Event {} },
      dispatchEvent: () => {
        received.push("z");
        return false;
      },
    } as unknown as Document;
    let prevented = false;
    const undo = Object.assign(keyEvent("z", { selected: false, ctrlKey: true }), {
      preventDefault: () => {
        prevented = true;
      },
    });
    forwardApplicationShortcut(undo, host);
    expect(received).toEqual([]);
    const release = claimFrameShortcut(host, "undo");
    forwardApplicationShortcut(undo, host);
    expect(received).toEqual(["z"]);
    // The host handled it, so the page's own undo does not run as well.
    expect(prevented).toBe(true);
    release();
    forwardApplicationShortcut(undo, host);
    expect(received).toEqual(["z"]);
  });
});

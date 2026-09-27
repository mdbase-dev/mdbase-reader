// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { selectionRangeKey, watchSettledSelection } from "./selection-settling.js";

function pointer(type: string, pointerType: string): Event {
  return Object.assign(new Event(type, { bubbles: true }), { pointerType });
}

describe("watchSettledSelection", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls back once the selection stops changing", () => {
    const settled = vi.fn();
    const stop = watchSettledSelection(document, settled);
    document.dispatchEvent(new Event("selectionchange"));
    vi.advanceTimersByTime(200);
    document.dispatchEvent(new Event("selectionchange"));
    vi.advanceTimersByTime(200);
    expect(settled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(settled).toHaveBeenCalledTimes(1);
    stop();
  });

  it("waits while a mouse drag is in progress", () => {
    const settled = vi.fn();
    const stop = watchSettledSelection(document, settled);
    document.dispatchEvent(pointer("pointerdown", "mouse"));
    document.dispatchEvent(new Event("selectionchange"));
    vi.advanceTimersByTime(1000);
    expect(settled).not.toHaveBeenCalled();
    document.dispatchEvent(pointer("pointerup", "mouse"));
    document.dispatchEvent(new Event("selectionchange"));
    vi.advanceTimersByTime(400);
    expect(settled).toHaveBeenCalledTimes(1);
    stop();
  });

  it("settles while a finger is still down, as after a long press", () => {
    const settled = vi.fn();
    const stop = watchSettledSelection(document, settled);
    document.dispatchEvent(pointer("pointerdown", "touch"));
    document.dispatchEvent(new Event("selectionchange"));
    vi.advanceTimersByTime(400);
    expect(settled).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe("selectionRangeKey", () => {
  it("names the same range the same way, and nothing for a caret", () => {
    document.body.innerHTML = "<p>alpha beta</p><p>gamma</p>";
    const text = document.querySelector("p")?.firstChild;
    const selection = window.getSelection();
    if (!text || !selection) {
      throw new Error("Missing fixture");
    }
    selection.removeAllRanges();
    selection.collapse(text, 2);
    expect(selectionRangeKey(selection)).toBeNull();
    selection.setBaseAndExtent(text, 0, text, 5);
    const key = selectionRangeKey(selection);
    expect(key).toBeTruthy();
    selection.setBaseAndExtent(text, 0, text, 5);
    expect(selectionRangeKey(selection)).toBe(key);
    selection.setBaseAndExtent(text, 0, text, 4);
    expect(selectionRangeKey(selection)).not.toBe(key);
  });
});

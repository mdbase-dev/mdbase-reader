import { afterEach, describe, expect, it, vi } from "vitest";

import { scheduleInitialEditorFocus } from "./editor-initial-focus.js";

import type { EditorView } from "@codemirror/view";
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
describe("initial editor focus", () => {
  it("focuses a newly mounted editor if the user has not moved on", () => {
    vi.useFakeTimers();
    const document = Object.assign(new EventTarget(), { activeElement: null });
    const focus = vi.fn();
    scheduleInitialEditorFocus({
      dom: { ownerDocument: document },
      focus,
    } as unknown as EditorView);
    vi.advanceTimersByTime(50);
    expect(focus).toHaveBeenCalledOnce();
  });
  it.each(["focusin", "keydown", "pointerdown"])(
    "never steals a subsequent %s in another editor",
    (event) => {
      vi.useFakeTimers();
      const document = Object.assign(new EventTarget(), { activeElement: null });
      const focus = vi.fn();
      scheduleInitialEditorFocus({
        dom: { ownerDocument: document },
        focus,
      } as unknown as EditorView);
      document.dispatchEvent(new Event(event));
      vi.advanceTimersByTime(50);
      expect(focus).not.toHaveBeenCalled();
    },
  );
});

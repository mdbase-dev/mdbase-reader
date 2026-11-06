// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useReaderShortcuts, type ReaderShortcutActions } from "./reader-app-hooks.js";
import { createRoot } from "./testing/i18n.js";

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
let actions: ReaderShortcutActions;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  actions = {
    focusMode: false,
    setFocusMode: vi.fn(),
    openCommands: vi.fn(),
    openShortcuts: vi.fn(),
    focusSearch: vi.fn(),
    switchTab: vi.fn(),
    focusNextPane: vi.fn(),
    reopenTab: vi.fn(),
    navigate: vi.fn(),
    toggleSidebar: vi.fn(),
    toggleNotes: vi.fn(),
    addSource: vi.fn(),
  };
  function Harness(): React.JSX.Element {
    useReaderShortcuts(actions);
    return (
      <>
        <div className="workspace-pane is-focused">
          <div className="library-workspace">
            <button data-toolbar>Display</button>
            <div className="library-table" role="grid">
              <select aria-label="Display settings">
                <option>All</option>
              </select>
              <div className="library-table-row" role="row" tabIndex={0}>
                Book
              </div>
            </div>
            <div className="library-card-grid">
              <button data-card>Cards</button>
            </div>
          </div>
        </div>
        <select aria-label="Language">
          <option>English</option>
        </select>
        <button data-outside>Other pane</button>
      </>
    );
  }
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function press(target: HTMLElement, key: string): KeyboardEvent {
  target.focus();
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

it.each(["Display settings", "Language"])(
  "leaves native %s selects in control of single keys",
  (label) => {
    const select = host.querySelector<HTMLElement>(`select[aria-label="${label}"]`)!;
    for (const key of ["a", "[", "j", "k", "/", "?"]) {
      expect(press(select, key).defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(select);
    }
    expect(actions.addSource).not.toHaveBeenCalled();
    expect(actions.toggleSidebar).not.toHaveBeenCalled();
    expect(actions.openShortcuts).not.toHaveBeenCalled();
    expect(actions.focusSearch).not.toHaveBeenCalled();
  },
);

it.each(["[data-toolbar]", "[data-outside]"])("does not run list commands from %s", (selector) => {
  const target = host.querySelector<HTMLElement>(selector)!;
  for (const key of ["a", "[", "j", "k"]) {
    expect(press(target, key).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(target);
  }
  expect(actions.addSource).not.toHaveBeenCalled();
  expect(actions.toggleSidebar).not.toHaveBeenCalled();
});

it.each([".library-table-row", "[data-card]"])(
  "keeps list commands available from %s",
  (selector) => {
    const target = host.querySelector<HTMLElement>(selector)!;
    expect(press(target, "a").defaultPrevented).toBe(true);
    expect(actions.addSource).toHaveBeenCalledOnce();
    expect(press(target, "[").defaultPrevented).toBe(true);
    expect(actions.toggleSidebar).toHaveBeenCalledOnce();
  },
);

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
            <div role="menu">
              <button role="menuitem" data-menu>
                Display choices
              </button>
            </div>
            <div className="library-table" role="grid">
              <select aria-label="Display settings">
                <option>All</option>
              </select>
              <div className="library-table-row" role="row" tabIndex={0}>
                Book
                <button data-row-action>More</button>
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

it.each(["[data-outside]"])("does not run list commands from %s", (selector) => {
  const target = host.querySelector<HTMLElement>(selector)!;
  for (const key of ["a", "[", "j", "k"]) {
    expect(press(target, key).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(target);
  }
  expect(actions.addSource).not.toHaveBeenCalled();
  expect(actions.toggleSidebar).not.toHaveBeenCalled();
});

it.each([".library-table-row", "[data-card]", "[data-toolbar]", ".workspace-pane", "body"])(
  "keeps list commands available from %s",
  (selector) => {
    const target = selector === "body" ? document.body : host.querySelector<HTMLElement>(selector)!;
    expect(press(target, "a").defaultPrevented).toBe(true);
    expect(actions.addSource).toHaveBeenCalledOnce();
    expect(press(target, "[").defaultPrevented).toBe(true);
    expect(actions.toggleSidebar).toHaveBeenCalledOnce();
  },
);

it("cycles panes from an editing control before its local key handler", () => {
  const select = host.querySelector<HTMLElement>('select[aria-label="Display settings"]')!;
  select.addEventListener("keydown", (event) => event.stopPropagation());
  expect(press(select, "F6").defaultPrevented).toBe(true);
  expect(actions.focusNextPane).toHaveBeenCalledOnce();
});

it("does not move panes behind a modal", () => {
  const modal = document.createElement("div");
  modal.setAttribute("aria-modal", "true");
  host.append(modal);
  expect(press(document.body, "F6").defaultPrevented).toBe(false);
  expect(actions.focusNextPane).not.toHaveBeenCalled();
});

it("preserves Enter on a library toolbar button", () => {
  const button = host.querySelector<HTMLElement>("[data-toolbar]")!;
  expect(press(button, "Enter").defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(button);
});

it.each(["[data-toolbar]", "[data-menu]", "[data-row-action]", ".workspace-pane", "body"])(
  "leaves Delete and F2 outside row context alone from %s",
  (selector) => {
    const target = selector === "body" ? document.body : host.querySelector<HTMLElement>(selector)!;
    const row = host.querySelector<HTMLElement>(".library-table-row")!;
    const rowKeys = vi.fn();
    row.addEventListener("keydown", rowKeys);
    for (const key of ["Delete", "F2"]) {
      expect(press(target, key).defaultPrevented).toBe(false);
      if (target !== document.body && target !== host.querySelector(".workspace-pane")) {
        expect(document.activeElement).toBe(target);
      }
    }
    expect(rowKeys).toHaveBeenCalledTimes(selector === "[data-row-action]" ? 2 : 0);
  },
);

it.each(["Delete", "F2"])("keeps %s available on the focused row", (key) => {
  const row = host.querySelector<HTMLElement>(".library-table-row")!;
  expect(press(row, key).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(row);
});

it.each(["[data-toolbar]", ".workspace-pane", "body"])(
  "keeps pane-wide navigation available from %s",
  (selector) => {
    const target = selector === "body" ? document.body : host.querySelector<HTMLElement>(selector)!;
    expect(press(target, "j").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(host.querySelector(".library-table-row"));
  },
);

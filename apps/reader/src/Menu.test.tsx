// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { Menu } from "./Menu.js";
import { createRoot } from "./testing/i18n.js";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderMenu(): { details: HTMLDetailsElement; panel: HTMLDivElement } {
  act(() =>
    root.render(
      <Menu label="Column options" trigger="Options">
        <button type="button">Hide column</button>
        <label data-menu-keep-open>
          Width <input defaultValue="180" />
        </label>
      </Menu>,
    ),
  );
  const details = host.querySelector("details")!;
  act(() => {
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
  const panel = document.querySelector<HTMLDivElement>(".reader-menu-panel")!;
  return { details, panel };
}

it("portals the panel outside its trigger's scrolling ancestors", () => {
  const { details, panel } = renderMenu();
  expect(host.contains(panel)).toBe(false);
  expect(panel.hidden).toBe(false);
  act(() => {
    panel.querySelector("input")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
  expect(details.open).toBe(true);
  act(() => panel.querySelector("input")!.click());
  expect(details.open).toBe(true);
  act(() => panel.querySelector("button")!.click());
  expect(details.open).toBe(false);
  expect(panel.hidden).toBe(true);
});

it("dismisses on Escape from the portal and restores focus to its summary", () => {
  const { details, panel } = renderMenu();
  const button = panel.querySelector("button")!;
  button.focus();
  act(() => {
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(details.open).toBe(false);
  expect(document.activeElement).toBe(details.querySelector("summary"));
});

it("dismisses on outside pointer without stealing the pointer's focus", () => {
  const { details } = renderMenu();
  const outside = document.createElement("button");
  document.body.append(outside);
  outside.focus();
  act(() => {
    outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
  expect(details.open).toBe(false);
  expect(document.activeElement).toBe(outside);
});

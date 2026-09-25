// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { CollectionPicker, CollectionSwitchingContext } from "./CollectionPicker.js";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const select = vi.fn();
const connect = vi.fn<() => Promise<void>>();
const beforeSwitch = vi.fn(() => true);

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  select.mockReset();
  connect.mockReset().mockResolvedValue(undefined);
  beforeSwitch.mockReset().mockReturnValue(true);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(connected = true): Promise<void> {
  await act(async () =>
    root.render(
      <CollectionSwitchingContext
        value={
          connected
            ? {
                collectionId: "a",
                connections: [
                  { collectionId: "a", displayName: "Old name" },
                  { collectionId: "b", displayName: "Second" },
                ],
                select,
                connect,
              }
            : null
        }
      >
        <CollectionPicker name="Current" beforeSwitch={beforeSwitch} />
      </CollectionSwitchingContext>,
    ),
  );
}
async function click(text: string): Promise<void> {
  const button = [...host.querySelectorAll("button")].find(
    (item) => item.getAttribute("aria-label") === text || item.textContent.includes(text),
  );
  if (!button) {
    throw new Error(`Missing button ${text}`);
  }
  await act(async () => button.click());
}
it("retains a static collection label without a Connect session", async () => {
  await render(false);
  expect(host.textContent).toContain("Current");
  expect(host.querySelector("button")).toBeNull();
});
const menu = (): Element | null => host.querySelector('[role="menu"]');

it("lists the current collection first, checked, and switches through the existing session", async () => {
  await render();
  await click("Switch collection: Current");
  expect(menu()).not.toBeNull();
  const items = [...host.querySelectorAll('[role="menuitemradio"]')];
  expect(items.map((item) => item.querySelector("strong")?.textContent)).toEqual([
    "Current",
    "Second",
  ]);
  expect(items[0]?.getAttribute("aria-checked")).toBe("true");
  expect(document.activeElement).toBe(items[0]);
  await click("Second");
  expect(beforeSwitch).toHaveBeenCalledOnce();
  expect(select).toHaveBeenCalledExactlyOnceWith("b");
  expect(menu()).toBeNull();
});
it("does not switch or prompt when choosing the current collection", async () => {
  await render();
  await click("Switch collection: Current");
  await click("Open now");
  expect(beforeSwitch).not.toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
  expect(menu()).toBeNull();
});
it("keeps the menu open when leaving unsaved edits is cancelled", async () => {
  beforeSwitch.mockReturnValue(false);
  await render();
  await click("Switch collection: Current");
  await click("Second");
  await click("Connect another collection");
  expect(select).not.toHaveBeenCalled();
  expect(connect).not.toHaveBeenCalled();
  expect(menu()).not.toBeNull();
});
it("uses the authorization flow for a new collection", async () => {
  await render();
  await click("Switch collection: Current");
  await click("Connect another collection");
  expect(connect).toHaveBeenCalledOnce();
  expect(menu()).toBeNull();
});
it("shows switching and connection errors without losing the menu", async () => {
  connect.mockRejectedValue(new Error("Connection unavailable"));
  await render();
  await click("Switch collection: Current");
  await click("Connect another collection");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Connection unavailable");
  expect(menu()).not.toBeNull();
});
it("opens from the keyboard and closes on Escape, returning focus to the trigger", async () => {
  await render();
  const trigger = host.querySelector("button");
  trigger?.focus();
  await act(async () =>
    trigger?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
  );
  expect(menu()).not.toBeNull();
  await act(async () =>
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );
  expect(menu()).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it("offers a filter once there are many collections", async () => {
  await act(async () =>
    root.render(
      <CollectionSwitchingContext
        value={{
          collectionId: "c0",
          connections: Array.from({ length: 8 }, (_, index) => ({
            collectionId: `c${String(index)}`,
            displayName: index === 5 ? "Thesis research" : `Collection ${String(index)}`,
          })),
          select,
          connect,
        }}
      >
        <CollectionPicker name="Collection 0" />
      </CollectionSwitchingContext>,
    ),
  );
  await click("Switch collection: Collection 0");
  const filter = host.querySelector<HTMLInputElement>('input[aria-label="Filter collections"]');
  expect(filter).not.toBeNull();
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setValue?.call(filter, "thesis");
    filter?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(
    [...host.querySelectorAll('[role="menuitemradio"] strong')].map((item) => item.textContent),
  ).toEqual(["Thesis research"]);
});

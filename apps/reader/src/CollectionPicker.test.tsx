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
it("marks the current collection and selects another through the existing session", async () => {
  await render();
  await click("Switch collection: Current");
  expect(host.querySelector("dialog")?.open).toBe(true);
  expect(host.querySelector('[aria-current="true"]')?.textContent).toContain("Current collection");
  await click("Second");
  expect(beforeSwitch).toHaveBeenCalledOnce();
  expect(select).toHaveBeenCalledExactlyOnceWith("b");
  expect(host.querySelector("dialog")).toBeNull();
});
it("does not switch or prompt when choosing the current collection", async () => {
  await render();
  await click("Switch collection: Current");
  await click("Current collection");
  expect(beforeSwitch).not.toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
});
it("keeps the picker open when leaving unsaved edits is cancelled", async () => {
  beforeSwitch.mockReturnValue(false);
  await render();
  await click("Switch collection: Current");
  await click("Second");
  await click("Connect another collection");
  expect(select).not.toHaveBeenCalled();
  expect(connect).not.toHaveBeenCalled();
  expect(host.querySelector("dialog")?.open).toBe(true);
});
it("uses the authorization flow for a new collection", async () => {
  await render();
  await click("Switch collection: Current");
  await click("Connect another collection");
  expect(connect).toHaveBeenCalledOnce();
  expect(host.querySelector("dialog")).toBeNull();
});
it("shows connection errors without losing the picker", async () => {
  connect.mockRejectedValue(new Error("Connection unavailable"));
  await render();
  await click("Switch collection: Current");
  await click("Connect another collection");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Connection unavailable");
  expect(host.querySelector("dialog")?.open).toBe(true);
});
it("closes on Escape and restores focus to the trigger", async () => {
  await render();
  const trigger = host.querySelector("button");
  trigger?.focus();
  await click("Switch collection: Current");
  await act(async () =>
    host.querySelector("dialog")?.dispatchEvent(new Event("cancel", { cancelable: true })),
  );
  expect(host.querySelector("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React work */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { lazyFeature } from "./lazy-feature.js";
import { Menu } from "./Menu.js";

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("does not load an unopened menu; intent and opening share the same download", async () => {
  const load = vi.fn(() => Promise.resolve({ default: () => <p>Ready settings</p> }));
  const Settings = lazyFeature(load, "settings");
  await act(async () =>
    root.render(
      <Menu label="Settings" trigger="Aa" defer onIntent={Settings.preload}>
        <Settings />
      </Menu>,
    ),
  );
  expect(load).not.toHaveBeenCalled();
  await act(async () =>
    host.querySelector("summary")?.dispatchEvent(new Event("focusin", { bubbles: true })),
  );
  expect(load).toHaveBeenCalledOnce();
  expect(host.textContent).not.toContain("Ready settings");
  await act(async () => {
    const details = host.querySelector("details");
    if (details) {
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    }
  });
  expect(host.textContent).toContain("Ready settings");
  expect(load).toHaveBeenCalledOnce();
});

it("shows loading state while a feature downloads", async () => {
  const module = { default: () => <p>Ready library</p> };
  let resolve!: (value: typeof module) => void;
  const Library = lazyFeature(
    () =>
      new Promise<typeof module>((complete) => {
        resolve = complete;
      }),
    "the library",
  );
  await act(async () => root.render(<Library />));
  expect(host.querySelector('[role="status"]')?.textContent).toBe("Loading the library…");
  await act(async () => resolve(module));
  expect(host.textContent).toContain("Ready library");
});

it("retries a rejected import without reloading the reader", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ default: () => <p>Ready editor</p> });
  const Editor = lazyFeature(load, "the editor");
  await act(async () => root.render(<Editor />));
  expect(host.textContent).toContain("Reader could not load the editor");
  await act(async () => host.querySelector("button")?.click());
  expect(host.textContent).toContain("Ready editor");
  expect(load).toHaveBeenCalledTimes(2);
});

it("a failed speculative preload does not poison a later open", async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ default: () => <p>Ready import</p> });
  const Import = lazyFeature(load, "import");
  await act(async () => Import.preload());
  await act(async () => root.render(<Import />));
  expect(host.textContent).toContain("Ready import");
  expect(load).toHaveBeenCalledTimes(2);
});

// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { citoidEnabled, useCitoidEnabled } from "./citoid-setting.js";
import { fakeChrome } from "./testing/fake-chrome.js";

let fake: ReturnType<typeof fakeChrome>;
let root: Root | undefined;
let setting: ReturnType<typeof useCitoidEnabled>;

function Harness(): null {
  const current = useCitoidEnabled();
  useEffect(() => {
    setting = current;
  }, [current]);
  return null;
}

async function mount(): Promise<void> {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<Harness />));
}

beforeEach(() => {
  fake = fakeChrome();
  vi.stubGlobal("chrome", fake.chrome);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

it.each([undefined, false, "true", 1, null])("is off for stored value %s", async (value) => {
  fake.local.set("citoid-enabled", value);
  await expect(citoidEnabled()).resolves.toBe(false);
  await mount();
  expect(setting[0]).toBe(false);
});

it("loads explicit consent and persists an opt-out", async () => {
  fake.local.set("citoid-enabled", true);
  await expect(citoidEnabled()).resolves.toBe(true);
  await mount();
  expect(setting[0]).toBe(true);
  await act(async () => setting[1](false));
  expect(setting[0]).toBe(false);
  expect(fake.local.get("citoid-enabled")).toBe(false);
});

it("persists opt-in and follows local changes in other extension contexts", async () => {
  await mount();
  await act(async () => setting[1](true));
  expect(fake.local.get("citoid-enabled")).toBe(true);
  await act(async () => fake.emit("storage", { "citoid-enabled": { newValue: false } }, "sync"));
  expect(setting[0]).toBe(true);
  await act(async () => fake.chrome.storage.local.set({ "citoid-enabled": false }));
  expect(setting[0]).toBe(false);
  await act(async () => fake.emit("storage", { "citoid-enabled": {} }, "local"));
  expect(setting[0]).toBe(false);
});

it("fails closed when storage cannot be read", async () => {
  vi.mocked(fake.chrome.storage.local.get).mockRejectedValue(new Error("storage unavailable"));
  await expect(citoidEnabled()).resolves.toBe(false);
  await mount();
  expect(setting[0]).toBe(false);
});

it("does not show a failed opt-out as saved", async () => {
  fake.local.set("citoid-enabled", true);
  await mount();
  vi.mocked(fake.chrome.storage.local.set).mockRejectedValueOnce(new Error("storage unavailable"));
  await act(async () => setting[1](false));
  expect(setting[0]).toBe(true);
  expect(fake.local.get("citoid-enabled")).toBe(true);
});

it("does not let an old read undo a more recent opt-out", async () => {
  let finish!: (value: Record<string, unknown>) => void;
  const get = vi.mocked(
    fake.chrome.storage.local.get as (key: string) => Promise<Record<string, unknown>>,
  );
  get.mockReturnValueOnce(
    new Promise<Record<string, unknown>>((resolve) => {
      finish = resolve;
    }),
  );
  await mount();
  await act(async () => fake.chrome.storage.local.set({ "citoid-enabled": false }));
  await act(async () => finish({ "citoid-enabled": true }));
  expect(setting[0]).toBe(false);
});

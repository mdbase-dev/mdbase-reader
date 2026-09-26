import { afterEach, expect, it, vi } from "vitest";

import { finishLocalReset, localResetPending, requestLocalReset } from "./local-reset.js";
import { fakeChrome } from "./testing/fake-chrome.js";

afterEach(() => vi.unstubAllGlobals());

it("persists a reset marker and reloads before touching credentials or pending writes", async () => {
  const fake = fakeChrome();
  vi.stubGlobal("chrome", fake.chrome);
  fake.local.set("connect:grant", "synthetic-grant");
  fake.local.set("connect:pending-write", "synthetic-write");
  await requestLocalReset();
  expect(await localResetPending()).toBe(true);
  expect(fake.local.get("connect:grant")).toBe("synthetic-grant");
  expect(fake.local.get("connect:pending-write")).toBe("synthetic-write");
  expect(fake.chrome.runtime.reload).toHaveBeenCalledOnce();
  expect(fake.chrome.storage.local.clear).not.toHaveBeenCalled();
});

it("clears signing databases, drafts, authorizations and optional permissions without network calls", async () => {
  const fake = fakeChrome();
  vi.stubGlobal("chrome", fake.chrome);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const deleteDatabase = vi.fn(() => {
    const request: { onsuccess?: () => void } = {};
    queueMicrotask(() => request.onsuccess?.());
    return request;
  });
  vi.stubGlobal("indexedDB", {
    databases: () => Promise.resolve([{ name: "test-keys" }, { name: "test-identity" }]),
    deleteDatabase,
  });
  fake.local.set("connect:grant", "synthetic");
  fake.session.set("draft:1", "synthetic draft");
  await requestLocalReset();
  expect(await finishLocalReset()).toBe(true);
  expect(deleteDatabase).toHaveBeenCalledTimes(2);
  expect(fake.local.size).toBe(0);
  expect(fake.session.size).toBe(0);
  expect(fake.chrome.permissions.remove).toHaveBeenCalledWith({
    origins: ["https://*/*", "http://127.0.0.1/*"],
  });
  expect(fetcher).not.toHaveBeenCalled();
  expect(await finishLocalReset()).toBe(false);
});

it("keeps the reset marker and stored recovery state when key deletion is blocked", async () => {
  const fake = fakeChrome();
  vi.stubGlobal("chrome", fake.chrome);
  vi.stubGlobal("indexedDB", {
    databases: () => Promise.resolve([{ name: "test-keys" }]),
    deleteDatabase: () => {
      const request: { onblocked?: () => void } = {};
      queueMicrotask(() => request.onblocked?.());
      return request;
    },
  });
  await requestLocalReset();
  fake.local.set("connect:pending-write", "synthetic");
  await expect(finishLocalReset()).rejects.toThrow("Close other Reader");
  expect(await localResetPending()).toBe(true);
  expect(fake.local.has("connect:pending-write")).toBe(true);
  expect(fake.chrome.storage.local.clear).not.toHaveBeenCalled();
});

it("fails closed when storage or permission cleanup fails", async () => {
  const fake = fakeChrome();
  vi.stubGlobal("chrome", fake.chrome);
  await requestLocalReset();
  vi.mocked(fake.chrome.permissions.remove).mockRejectedValueOnce(new Error("denied"));
  await expect(finishLocalReset()).rejects.toThrow("denied");
  expect(await localResetPending()).toBe(true);
});

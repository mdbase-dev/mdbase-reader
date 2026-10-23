import { createI18nRuntime } from "@mdbase-dev/i18n";
import english from "@mdbase-reader/i18n/english";
import { afterEach, expect, it, vi } from "vitest";

import { extensionLocaleStorage, followExtensionLocale } from "./extension-locale.js";
import { fakeChrome } from "./testing/fake-chrome.js";

afterEach(() => vi.unstubAllGlobals());

it("shares successful language choices across pages and the worker without write loops", async () => {
  const fake = fakeChrome();
  vi.stubGlobal("chrome", fake.chrome);
  const makeRuntime = (): ReturnType<typeof createI18nRuntime> =>
    createI18nRuntime({
      english,
      loadLocale: () => Promise.resolve({ messages: { greeting: "Bonjour" } }),
      storage: extensionLocaleStorage,
      preferences: [],
    });
  const page = makeRuntime();
  const worker = makeRuntime();
  const stop = followExtensionLocale(worker);
  try {
    expect(page.i18n.locale).toBe("en");
    await Promise.all([page.initialize(), worker.initialize()]);
    await page.selectLocale("fr");
    await vi.waitFor(() => expect(worker.i18n.locale).toBe("fr"));
    expect(worker.i18n._("greeting")).toBe("Bonjour");
    expect(fake.local.get("mdbase-reader:locale")).toBe("fr");
    expect(fake.chrome.storage.local.set).toHaveBeenCalledTimes(2);
    fake.emit("storage", { "mdbase-reader:locale": { newValue: "unsupported" } }, "local");
    expect(worker.i18n.locale).toBe("fr");
  } finally {
    stop();
  }
});

it("does not persist a failed catalogue or disturb the English fallback", async () => {
  const fake = fakeChrome();
  vi.stubGlobal("chrome", fake.chrome);
  const runtime = createI18nRuntime({
    english,
    loadLocale: () => Promise.reject(new Error("missing local asset")),
    storage: extensionLocaleStorage,
    preferences: [],
  });
  await expect(runtime.selectLocale("ja")).rejects.toThrow("missing local asset");
  expect(runtime.i18n.locale).toBe("en");
  expect(fake.chrome.storage.local.set).not.toHaveBeenCalled();
});

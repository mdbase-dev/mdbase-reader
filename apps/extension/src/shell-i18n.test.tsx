// @vitest-environment happy-dom
import { runInNewContext } from "node:vm";

import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { afterEach, expect, it, vi } from "vitest";

import { localizedCaptureError } from "./capture-errors.js";
import { problemMessage } from "./capture-model.js";
import { markSavedPage, markSavedPosts, resetPageMarkCache } from "./page-badge.js";
import { fetchPdf, pagePdfBytes } from "./page-capture.js";
import { PanelTabs } from "./PanelTabs.js";
import { renderWithI18n } from "./testing/i18n.js";

afterEach(() => {
  i18n.activate("en");
  vi.unstubAllGlobals();
});

it("translates lazy tab descriptors without translating their stable identities", () => {
  const note = msg`Literature note`;
  i18n.load("fr", { [note.id]: "Note de lecture" });
  i18n.activate("fr");
  const html = renderWithI18n(<PanelTabs tab="note" highlightCount={2} onChange={vi.fn()} />);
  expect(html).toContain("Note de lecture");
  expect(html).toContain('id="panel-tab-note"');
  expect(html).toContain('aria-controls="panel-note"');
});

it("formats zero, one and many badge counts with ICU plurals", async () => {
  const setTitle = vi.fn(() => Promise.resolve());
  vi.stubGlobal("chrome", {
    storage: { session: { get: () => Promise.resolve({}), set: () => Promise.resolve() } },
    action: {
      setTitle,
      setBadgeText: () => Promise.resolve(),
      setBadgeBackgroundColor: () => Promise.resolve(),
    },
  });
  resetPageMarkCache();
  for (const count of [0, 1, 5]) {
    await markSavedPage(1, count);
    expect(setTitle).toHaveBeenLastCalledWith({
      tabId: 1,
      title: count
        ? `Saved in mdbase Reader · ${String(count)} highlight${count === 1 ? "" : "s"}`
        : "Saved in mdbase Reader",
    });
  }
  await markSavedPosts(1, 1, 1);
  expect(setTitle).toHaveBeenLastCalledWith({
    tabId: 1,
    title: "1 saved post in mdbase Reader · 1 highlight on visible posts",
  });
  await markSavedPosts(1, 3, 0);
  expect(setTitle).toHaveBeenLastCalledWith({
    tabId: 1,
    title: "3 saved posts in mdbase Reader · 0 highlights on visible posts",
  });
});

it("localizes stable injected errors while preserving unknown authority diagnostics", () => {
  const message = msg`The post is not loaded. Scroll it into view and try again.`;
  i18n.load("fr", { [message.id]: "La publication n’est pas chargée." });
  i18n.activate("fr");
  const reason = new Error("Error: reader/post-not-loaded");
  const localized = localizedCaptureError(reason);
  expect(localized).toBeInstanceOf(Error);
  expect((localized as Error).message).toBe("La publication n’est pas chargée.");
  expect((localized as Error).cause).toBe(reason);
  expect(problemMessage(localized)).toBe("La publication n’est pas chargée.");
  const authority = new Error("authority diagnostic");
  expect(localizedCaptureError(authority)).toBe(authority);
});

it("keeps injected PDF code serializable and returns a stable size code", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(new Uint8Array(5)))),
  );
  // Exactly the boundary Chrome uses: no module imports or enclosing closure survive.
  const injected = runInNewContext(`(${pagePdfBytes.toString()})`, {
    fetch: globalThis.fetch,
    location: window.location,
    Uint8Array,
    btoa,
  }) as typeof pagePdfBytes;
  await expect(injected(location.href, 4)).resolves.toEqual({ error: "too-large" });
});

it("never retries an oversized PDF based on translated error wording", async () => {
  const maximumMb = 40;
  const message = msg`This PDF is larger than ${maximumMb} MB. Download it and import the file in Reader.`;
  i18n.load("fr", { [message.id]: "Ce PDF dépasse la taille autorisée." });
  i18n.activate("fr");
  vi.stubGlobal("chrome", {
    scripting: {
      executeScript: vi.fn(() => Promise.resolve([{ result: { error: "too-large" } }])),
    },
  });
  const fallback = vi.fn();
  vi.stubGlobal("fetch", fallback);
  await expect(fetchPdf(1, "https://example.com/test.pdf")).rejects.toThrow(
    "Ce PDF dépasse la taille autorisée.",
  );
  expect(fallback).not.toHaveBeenCalled();
});

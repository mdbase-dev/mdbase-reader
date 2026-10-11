import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { updateSocialStatus } from "./background-social-status.js";
import { resetPageMarkCache } from "./page-badge.js";
import { fakeChrome } from "./testing/fake-chrome.js";

import type { PageStatusConnect } from "./page-status-connect.js";
import type { PostRef } from "@mdbase-reader/web-capture";

beforeEach(() => resetPageMarkCache());
afterEach(() => vi.unstubAllGlobals());

function refs(): PostRef[] {
  return ["100", "101"].map((id) => ({
    platform: "x",
    id,
    url: `https://x.com/i/status/${id}`,
    sourceUrl: "https://x.com/i/status/100",
    author: "Fixture Author",
    snippet: "Durable post",
    top: 0,
    bottom: 200,
  }));
}

function setupPagePosts(posts: readonly PostRef[]): ReturnType<typeof fakeChrome> {
  const fake = fakeChrome();
  vi.stubGlobal("chrome", {
    ...fake.chrome,
    scripting: { executeScript: vi.fn(() => Promise.resolve([{ result: posts }])) },
  });
  return fake;
}

it("matches each visible post's source identity and counts/draws only visible part annotations", async () => {
  const fake = setupPagePosts(refs());
  const draw = vi.fn(() => Promise.resolve());
  const api = { drawPageQuotes: draw } as unknown as PageStatusConnect;
  const find = vi.fn(() =>
    Promise.resolve({
      api,
      quotes: [
        { exact: "First", postUrl: "https://x.com/i/status/100" },
        { exact: "Second", postUrl: "https://x.com/i/status/101" },
        { exact: "Not visible", postUrl: "https://x.com/i/status/999" },
      ],
    }),
  );
  expect(await updateSocialStatus(1, "https://x.com/home", find, () => true)).toBe(true);
  expect(find).toHaveBeenCalledOnce();
  expect(find).toHaveBeenCalledWith("https://x.com/i/status/100");
  expect(draw).toHaveBeenCalledWith(
    1,
    [
      expect.objectContaining({ postUrl: "https://x.com/i/status/100" }),
      expect.objectContaining({ postUrl: "https://x.com/i/status/101" }),
    ],
    "https://x.com/home",
  );
  expect(fake.chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 1, text: "2" });
  expect(fake.chrome.action.setTitle).toHaveBeenLastCalledWith({
    tabId: 1,
    title: "2 saved posts in mdbase Reader · 2 highlights on visible posts",
  });
});

it("does not look up a feed URL or invent a source when no posts are loaded", async () => {
  const fake = setupPagePosts([]);
  const find = vi.fn(() => Promise.resolve(null));
  expect(await updateSocialStatus(1, "https://x.com/home", find, () => true)).toBe(true);
  expect(find).not.toHaveBeenCalled();
  expect(fake.chrome.action.setBadgeText).not.toHaveBeenCalled();
});

it("does not draw or badge stale results after navigation", async () => {
  const fake = setupPagePosts(refs());
  const draw = vi.fn();
  const find = vi.fn(() =>
    Promise.resolve({ api: { drawPageQuotes: draw } as unknown as PageStatusConnect, quotes: [] }),
  );
  await updateSocialStatus(1, "https://x.com/home", find, () => false);
  expect(draw).not.toHaveBeenCalled();
  expect(fake.chrome.action.setBadgeText).not.toHaveBeenCalled();
});

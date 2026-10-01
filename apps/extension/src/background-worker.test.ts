import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { updatePageStatus } from "./background-page-status.js";
import { chromeStorageMirror } from "./chrome-storage.js";
import { markSavedPage, resetPageMarkCache } from "./page-badge.js";
import { resetPageStatusCache, setPageStatusEnabled } from "./page-status.js";
import {
  rememberSavedUrls,
  resetSavedUrlIndexCache,
  savedUrlIndexTtlMs,
  savedUrlKey,
  savedUrlStatus,
  writeSavedUrlIndex,
} from "./saved-url-index.js";
import { forgetTab } from "./tab-cleanup.js";
import { fakeChrome } from "./testing/fake-chrome.js";

import type { PageStatusConnect } from "./page-status-connect.js";
import type { ReaderConnectedCollection } from "@mdbase-reader/connect";

type Fake = ReturnType<typeof fakeChrome>;

/** fakeChrome plus the worker-only APIs these modules use. */
function workerChrome(options: { granted?: boolean; panels?: number[] } = {}): Fake {
  const fake = fakeChrome();
  const event = (): unknown => ({ addListener: vi.fn(), removeListener: vi.fn() });
  const api = fake.chrome as unknown as Record<string, Record<string, unknown>>;
  Object.assign(api["permissions"] ?? {}, {
    contains: vi.fn(() => Promise.resolve(options.granted ?? true)),
    onAdded: event(),
    onRemoved: event(),
  });
  Object.assign(api["runtime"] ?? {}, {
    getManifest: () => ({ action: { default_title: "Save to mdbase Reader" } }),
    getContexts: vi.fn(() =>
      Promise.resolve(
        (options.panels ?? []).map((tab) => ({
          contextType: "SIDE_PANEL",
          documentUrl: `chrome-extension://id/capture.html?tab=${String(tab)}`,
        })),
      ),
    ),
  });
  vi.stubGlobal("chrome", fake.chrome);
  return fake;
}

/** Every extension API call the fake records, by name. */
function apiCalls(fake: Fake): number {
  const { storage, action, permissions, runtime, scripting } = fake.chrome as unknown as Record<
    string,
    Record<string, unknown>
  >;
  const areas = [storage?.["local"], storage?.["session"]] as Record<string, unknown>[];
  return [...areas, action, permissions, runtime, scripting]
    .flatMap((group) => Object.values(group ?? {}))
    .filter((value) => vi.isMockFunction(value))
    .reduce((total, mock) => total + (mock as ReturnType<typeof vi.fn>).mock.calls.length, 0);
}

function collection(id = "c1"): ReaderConnectedCollection {
  return { collectionId: id } as unknown as ReaderConnectedCollection;
}

function connectApi(
  saved: Record<string, number>,
  selected: ReaderConnectedCollection | null = collection(),
): PageStatusConnect & { [K in keyof PageStatusConnect]: ReturnType<typeof vi.fn> } {
  return {
    selectedCollection: vi.fn(() => Promise.resolve(selected)),
    savedSourceUrls: vi.fn(() => Promise.resolve(Object.keys(saved))),
    savedQuotes: vi.fn((_: unknown, url: string) => {
      const found = Object.entries(saved).find(
        ([saved]) => savedUrlKey(saved) === savedUrlKey(url),
      );
      return Promise.resolve(
        found
          ? Array.from({ length: found[1] }, (_, index) => ({ exact: `q${String(index)}` }))
          : null,
      );
    }),
    drawPageQuotes: vi.fn(() => Promise.resolve()),
  };
}

beforeEach(() => {
  resetPageMarkCache();
  resetPageStatusCache();
  resetSavedUrlIndexCache();
});
afterEach(() => vi.unstubAllGlobals());

describe("page status with the setting off", () => {
  it("reads storage once per worker lifetime and never loads Connect", async () => {
    const fake = workerChrome();
    const connect = vi.fn();
    await updatePageStatus(1, "https://example.com/a", connect);
    const first = apiCalls(fake);
    // The setting and the marked tabs: one read each, and no permission check.
    expect(first).toBe(2);
    expect(fake.chrome.permissions.contains).not.toHaveBeenCalled();
    for (let tab = 2; tab < 20; tab++) {
      await updatePageStatus(tab, `https://example.com/${String(tab)}`, connect);
    }
    await updatePageStatus(3, "chrome://newtab/", connect);
    expect(apiCalls(fake)).toBe(first);
    expect(connect).not.toHaveBeenCalled();
    expect(fake.chrome.action.setBadgeText).not.toHaveBeenCalled();
  });

  it("still clears a tab it marked earlier, and only that tab", async () => {
    const fake = workerChrome();
    await markSavedPage(7, 2);
    vi.mocked(fake.chrome.action.setBadgeText).mockClear();
    resetPageMarkCache(); // a new worker: marks come back from storage.session
    await updatePageStatus(8, "https://example.com/", vi.fn());
    expect(fake.chrome.action.setBadgeText).not.toHaveBeenCalled();
    await updatePageStatus(7, "https://example.com/", vi.fn());
    expect(fake.chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: "" });
    expect(fake.session.get("page-marks")).toEqual([]);
  });

  it("turning the setting off clears every mark", async () => {
    const fake = workerChrome();
    await markSavedPage(3, 0);
    await markSavedPage(4, 1);
    vi.mocked(fake.chrome.action.setBadgeText).mockClear();
    await setPageStatusEnabled(false);
    expect(fake.chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 3, text: "" });
    expect(fake.chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 4, text: "" });
    expect(fake.session.has("page-marks")).toBe(false);
  });
});

describe("page status with the setting on", () => {
  function enabled(options: { panels?: number[] } = {}): Fake {
    const fake = workerChrome(options);
    fake.local.set("page-status", true);
    fake.local.set("last-collection", "c1");
    return fake;
  }

  it("builds the index once, then dismisses unsaved pages without loading Connect", async () => {
    enabled();
    const api = connectApi({ "https://example.com/saved?utm_source=x": 2 });
    const connect = vi.fn(() => api);
    await updatePageStatus(1, "https://example.com/other", connect);
    expect(api.savedSourceUrls).toHaveBeenCalledTimes(1);
    expect(api.savedQuotes).not.toHaveBeenCalled();
    connect.mockClear();
    await updatePageStatus(1, "https://example.com/elsewhere", connect);
    expect(connect).not.toHaveBeenCalled();
  });

  it("marks and draws a saved page under any spelling of its address", async () => {
    const fake = enabled();
    const api = connectApi({ "https://www.example.com/saved/?utm_source=x": 2 });
    await updatePageStatus(5, "https://example.com/saved#top", () => api);
    expect(fake.chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 5, text: "2" });
    expect(api.drawPageQuotes).toHaveBeenCalledWith(
      5,
      expect.any(Array),
      "https://example.com/saved#top",
    );
  });

  it("leaves drawing to the tab's open side panel but still sets the badge", async () => {
    const fake = enabled({ panels: [5] });
    const api = connectApi({ "https://example.com/saved": 3 });
    await updatePageStatus(5, "https://example.com/saved", () => api);
    expect(fake.chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 5, text: "3" });
    expect(api.drawPageQuotes).not.toHaveBeenCalled();
    await updatePageStatus(6, "https://example.com/saved", () => api);
    expect(api.drawPageQuotes).toHaveBeenCalledWith(
      6,
      expect.any(Array),
      "https://example.com/saved",
    );
  });

  it("does not mark a page that was replaced while it was looked up", async () => {
    const fake = enabled();
    const api = connectApi({ "https://example.com/saved": 1 });
    let release = (): void => undefined;
    const lookup = new Promise((resolve) => {
      release = () => resolve([{ exact: "q" }]);
    });
    api.savedQuotes.mockReturnValueOnce(lookup);
    const slow = updatePageStatus(2, "https://example.com/saved", () => api);
    await vi.waitFor(() => expect(api.savedQuotes).toHaveBeenCalled());
    await updatePageStatus(2, "https://example.com/other", () => api);
    release();
    await slow;
    expect(fake.chrome.action.setBadgeText).not.toHaveBeenCalledWith({ tabId: 2, text: "1" });
  });

  it("drops an index entry Connect no longer confirms", async () => {
    enabled();
    await writeSavedUrlIndex("c1", ["https://example.com/deleted"]);
    const api = connectApi({});
    await updatePageStatus(1, "https://example.com/deleted", () => api);
    expect(api.savedQuotes).toHaveBeenCalledTimes(1);
    await expect(savedUrlStatus("c1", "https://example.com/deleted")).resolves.toBe("unsaved");
  });
});

describe("saved-URL index", () => {
  it("is stale until built, and again once it expires, so misses do not last", async () => {
    const fake = workerChrome();
    await expect(savedUrlStatus("c1", "https://example.com/a")).resolves.toBe("stale");
    await writeSavedUrlIndex("c1", ["https://example.com/a", "doi:10.1/x"], 1_000);
    await expect(savedUrlStatus("c1", "https://www.example.com/a/", 2_000)).resolves.toBe("saved");
    await expect(savedUrlStatus("c1", "https://example.com/b", 2_000)).resolves.toBe("unsaved");
    await expect(savedUrlStatus("c2", "https://example.com/a", 2_000)).resolves.toBe("stale");
    await expect(
      savedUrlStatus("c1", "https://example.com/b", 1_000 + savedUrlIndexTtlMs),
    ).resolves.toBe("stale");
    // Stored compactly, without the addresses themselves.
    expect(JSON.stringify(fake.local.get("saved-urls:c1"))).not.toContain("example");
  });

  it("learns pages the panel saves, including saves made in another context", async () => {
    const fake = workerChrome();
    const now = Date.now();
    await writeSavedUrlIndex("c1", [], now);
    await expect(savedUrlStatus("c1", "https://example.com/new")).resolves.toBe("unsaved");
    // The panel's write reaches this context's cache through storage.onChanged.
    const stored = fake.local.get("saved-urls:c1") as { urls: string[] };
    await fake.chrome.storage.local.set({
      "saved-urls:c1": {
        refreshedAt: now,
        urls: [...stored.urls, savedUrlKey("https://example.com/new")],
      },
    });
    await expect(savedUrlStatus("c1", "https://example.com/new")).resolves.toBe("saved");
    await rememberSavedUrls("c1", ["https://example.com/other?utm_medium=y", null]);
    await expect(savedUrlStatus("c1", "https://example.com/other")).resolves.toBe("saved");
  });

  it("is not created by a remembered save, which would hide every other saved page", async () => {
    const fake = workerChrome();
    await rememberSavedUrls("c1", ["https://example.com/new"]);
    expect(fake.local.has("saved-urls:c1")).toBe(false);
  });
});

describe("closing a tab", () => {
  it("removes only that tab's drafts, intent and mark, reading key names only", async () => {
    const fake = workerChrome();
    const getKeys = vi.fn(() => Promise.resolve([...fake.session.keys()]));
    Object.assign(fake.chrome.storage.session, { getKeys });
    fake.session.set("draft:4:https://example.com/a", { draft: {} });
    fake.session.set("draft:4:https://example.com/b", { draft: {} });
    fake.session.set("draft:41:https://example.com/a", { draft: {} });
    fake.session.set("intent:4", "capture");
    fake.session.set("note:c1:s1", { body: "", baseBody: "" });
    await markSavedPage(4, 1);
    await markSavedPage(5, 1);
    await forgetTab(4);
    expect(fake.chrome.storage.session.get).not.toHaveBeenCalledWith(null);
    expect([...fake.session.keys()].sort((a, b) => a.localeCompare(b))).toEqual([
      "draft:41:https://example.com/a",
      "note:c1:s1",
      "page-marks",
    ]);
    expect(fake.session.get("page-marks")).toEqual([5]);
  });

  it("falls back to reading the area where Chrome cannot list keys", async () => {
    const fake = workerChrome();
    fake.session.set("draft:4:https://example.com/a", { draft: {} });
    await forgetTab(4);
    expect(fake.session.has("draft:4:https://example.com/a")).toBe(false);
  });
});

describe("Connect storage mirror", () => {
  it("adds one storage listener per area however often Connect is reopened", async () => {
    const fake = workerChrome();
    const addListener = vi.spyOn(fake.chrome.storage.onChanged, "addListener");
    const first = await chromeStorageMirror(fake.chrome.storage.local);
    for (let retry = 0; retry < 5; retry++) {
      await expect(chromeStorageMirror(fake.chrome.storage.local)).resolves.toBe(first);
    }
    expect(addListener).toHaveBeenCalledTimes(1);
  });

  it("keeps a change made while it was loading", async () => {
    const fake = workerChrome();
    fake.local.set("connect:grant", "old");
    type Get = (keys: unknown) => Promise<Record<string, unknown>>;
    const get = vi.mocked(fake.chrome.storage.local.get as unknown as Get);
    const load = get.getMockImplementation() as Get;
    get.mockImplementationOnce((keys) =>
      load(keys).then((values) =>
        fake.chrome.storage.local.set({ "connect:grant": "new" }).then(() => values),
      ),
    );
    const storage = await chromeStorageMirror(fake.chrome.storage.local);
    expect(storage.getItem("grant")).toBe("new");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { chromeStorageMirror } from "./chrome-storage.js";
import { emptyDraft, loadDraft, saveDraft } from "./drafts.js";
import { pageStatusEnabled, setPageStatusEnabled } from "./page-status.js";
import { fakeChrome } from "./testing/fake-chrome.js";

afterEach(() => vi.unstubAllGlobals());

describe("Connect storage shared across extension contexts", () => {
  it("answers synchronously and writes through to chrome.storage.local", async () => {
    const fake = fakeChrome();
    vi.stubGlobal("chrome", fake.chrome);
    const storage = await chromeStorageMirror(fake.chrome.storage.local);
    storage.setItem("mdbase-connect:grant", "signed");
    expect(storage.getItem("mdbase-connect:grant")).toBe("signed");
    expect(fake.local.get("connect:mdbase-connect:grant")).toBe("signed");
    storage.removeItem("mdbase-connect:grant");
    expect(fake.local.has("connect:mdbase-connect:grant")).toBe(false);
  });

  it("follows grants written by another context", async () => {
    const fake = fakeChrome();
    vi.stubGlobal("chrome", fake.chrome);
    const storage = await chromeStorageMirror(fake.chrome.storage.local);
    await fake.chrome.storage.local.set({ "connect:mdbase-connect:grant": "from-panel" });
    expect(storage.getItem("mdbase-connect:grant")).toBe("from-panel");
  });
});

describe("session drafts", () => {
  it("restores unsaved text for the same tab and page, ignoring tracking parameters", async () => {
    const fake = fakeChrome();
    vi.stubGlobal("chrome", fake.chrome);
    const selection = { exact: "a passage" };
    await saveDraft(4, "https://example.com/story?utm_source=x", {
      draft: { ...emptyDraft, comment: "My note" },
      selection,
    });
    await expect(loadDraft(4, "https://www.example.com/story")).resolves.toMatchObject({
      draft: { comment: "My note", color: "yellow" },
      selection,
    });
    await expect(loadDraft(5, "https://example.com/story")).resolves.toBeNull();
  });

  it("does not keep empty drafts", async () => {
    const fake = fakeChrome();
    vi.stubGlobal("chrome", fake.chrome);
    await saveDraft(4, "https://example.com/a", {
      draft: { ...emptyDraft, comment: "x" },
      selection: null,
    });
    await saveDraft(4, "https://example.com/a", { draft: emptyDraft, selection: null });
    expect(fake.session.size).toBe(0);
  });
});

describe("page status opt-in", () => {
  it("is off unless both the setting and the host permission are present", async () => {
    const fake = fakeChrome();
    vi.stubGlobal("chrome", fake.chrome);
    await expect(pageStatusEnabled()).resolves.toBe(false);
    await expect(setPageStatusEnabled(true)).resolves.toBe(true);
    expect(fake.chrome.permissions.request).toHaveBeenCalledWith({ origins: ["https://*/*"] });
    vi.mocked(fake.chrome.permissions.contains as () => Promise<boolean>).mockResolvedValue(true);
    await expect(pageStatusEnabled()).resolves.toBe(true);
  });

  it("stays off when the reader declines the permission, and gives it back when turned off", async () => {
    const fake = fakeChrome();
    vi.stubGlobal("chrome", fake.chrome);
    vi.mocked(fake.chrome.permissions.request as () => Promise<boolean>).mockResolvedValue(false);
    await expect(setPageStatusEnabled(true)).resolves.toBe(false);
    expect(fake.local.get("page-status")).toBeUndefined();
    await setPageStatusEnabled(false);
    expect(fake.chrome.permissions.remove).toHaveBeenCalled();
  });
});

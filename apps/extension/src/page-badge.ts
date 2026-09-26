/**
 * The toolbar button's mark for one tab: the number of highlights on a saved page, or ✓.
 * Chrome resets tab-specific badges only when the tab closes, so every page load clears it.
 */
export async function markSavedPage(tabId: number, highlights: number): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#005c88" });
  await chrome.action.setBadgeText({ tabId, text: highlights ? String(highlights) : "✓" });
  await chrome.action.setTitle({
    tabId,
    title: `Saved in mdbase Reader${highlights ? ` · ${String(highlights)} highlight${highlights === 1 ? "" : "s"}` : ""}`,
  });
}

export async function clearPageMark(tabId: number): Promise<void> {
  await chrome.action.setBadgeText({ tabId, text: "" });
  const { action } = chrome.runtime.getManifest() as {
    readonly action?: { readonly default_title?: string };
  };
  const title = action?.default_title;
  if (title) {
    await chrome.action.setTitle({ tabId, title });
  }
}

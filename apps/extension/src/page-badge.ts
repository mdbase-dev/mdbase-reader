/**
 * The toolbar button's mark for one tab: the number of highlights on a saved page, or ✓.
 * Chrome resets tab-specific badges only when the tab closes, so a marked tab loses its
 * mark on its next page load. The marked tabs are remembered in `chrome.storage.session`
 * so the worker leaves every other tab alone, even after it restarts.
 */
const marksKey = "page-marks";

let marks: Promise<Set<number>> | null = null;

function markedTabs(): Promise<Set<number>> {
  marks ??= chrome.storage.session
    .get(marksKey)
    .then(({ [marksKey]: value }) =>
      Array.isArray(value)
        ? new Set(value.filter((tabId): tabId is number => typeof tabId === "number"))
        : new Set<number>(),
    )
    .catch(() => new Set<number>());
  return marks;
}

async function updateMarks(edit: (tabs: Set<number>) => boolean): Promise<void> {
  const tabs = await markedTabs();
  if (edit(tabs)) {
    await chrome.storage.session.set({ [marksKey]: [...tabs] });
  }
}

export async function markSavedPage(tabId: number, highlights: number): Promise<void> {
  await updateMarks((tabs) => {
    if (tabs.has(tabId)) {
      return false;
    }
    tabs.add(tabId);
    return true;
  });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#005c88" });
  await chrome.action.setBadgeText({ tabId, text: highlights ? String(highlights) : "✓" });
  await chrome.action.setTitle({
    tabId,
    title: `Saved in mdbase Reader${highlights ? ` · ${String(highlights)} highlight${highlights === 1 ? "" : "s"}` : ""}`,
  });
}

async function resetBadge(tabId: number): Promise<void> {
  await chrome.action.setBadgeText({ tabId, text: "" });
  const { action } = chrome.runtime.getManifest() as {
    readonly action?: { readonly default_title?: string };
  };
  const title = action?.default_title;
  if (title) {
    await chrome.action.setTitle({ tabId, title });
  }
}

/** Clears the tab's mark; tabs that were never marked cost no extension API call. */
export async function clearPageMark(tabId: number): Promise<void> {
  const tabs = await markedTabs();
  if (!tabs.has(tabId)) {
    return;
  }
  await updateMarks((current) => current.delete(tabId));
  await resetBadge(tabId);
}

/** A closed tab's badge goes with it; only the record of the mark is left to drop. */
export async function forgetPageMark(tabId: number): Promise<void> {
  await updateMarks((tabs) => tabs.delete(tabId));
}

/** When page status is turned off, every mark it left goes too. */
export async function clearAllPageMarks(): Promise<void> {
  const tabs = await markedTabs();
  const marked = [...tabs];
  tabs.clear();
  await chrome.storage.session.remove(marksKey);
  await Promise.all(marked.map((tabId) => resetBadge(tabId).catch(() => undefined)));
}

/** For tests: forget the marks loaded in this context. */
export function resetPageMarkCache(): void {
  marks = null;
}

import { clearPageMark, markSavedPage } from "./page-badge.js";
import { pageStatusEnabledCached } from "./page-status.js";
import { panelShowsTab } from "./panel-presence.js";
import {
  forgetSavedUrl,
  pageStatusCollection,
  savedUrlStatus,
  writeSavedUrlIndex,
} from "./saved-url-index.js";

import type { PageQuote } from "./page-annotations.js";
import type { PageStatusConnect } from "./page-status-connect.js";

// The latest page load per tab: a slow lookup must not mark the page that replaced it.
const loads = new Map<number, number>();
let nextLoad = 0;

/**
 * The saved highlights for a page, or null when it is not saved. Asks Connect only when
 * the saved-URL index cannot rule the page out, and rebuilds the index when it is stale
 * or belongs to another collection.
 */
async function savedPage(
  url: string,
  connect: () => PageStatusConnect,
): Promise<{ api: PageStatusConnect; quotes: readonly PageQuote[] } | null> {
  const indexed = await pageStatusCollection();
  const status = indexed ? await savedUrlStatus(indexed, url) : "stale";
  if (status === "unsaved") {
    return null;
  }
  const api = connect();
  const collection = await api.selectedCollection();
  if (!collection) {
    return null;
  }
  const { collectionId } = collection;
  if (indexed !== collectionId || status === "stale") {
    await writeSavedUrlIndex(collectionId, await api.savedSourceUrls(collection));
    if ((await savedUrlStatus(collectionId, url)) === "unsaved") {
      return null;
    }
  }
  const quotes = await api.savedQuotes(collection, url);
  if (!quotes) {
    // Deleted since the index was built, or a hash collision.
    await forgetSavedUrl(collectionId, url);
    return null;
  }
  return { api, quotes };
}

/**
 * With the opt-in page-status setting, marks pages saved in the selected collection
 * (badge: number of highlights, or ✓) and draws the saved highlights on them, unless the
 * tab's side panel is open and draws them itself.
 *
 * Every page load in every tab wakes the worker for this, so the common cases stay cheap:
 * with the setting off it reads two storage values per worker lifetime, and with it on, a
 * page the saved-URL index rules out never loads or starts Connect (`connect`).
 */
export async function updatePageStatus(
  tabId: number,
  url: string | undefined,
  connect: () => PageStatusConnect,
): Promise<void> {
  const load = ++nextLoad;
  loads.set(tabId, load);
  const current = (): boolean => loads.get(tabId) === load;
  try {
    // Tab badges outlive navigation, so a marked tab loses its mark on every page load.
    await clearPageMark(tabId);
    if (!url?.startsWith("https://") || !(await pageStatusEnabledCached())) {
      return;
    }
    const found = await savedPage(url, connect);
    if (!found || !current()) {
      return;
    }
    const { api, quotes } = found;
    await markSavedPage(tabId, quotes.length);
    if (quotes.length && !(await panelShowsTab(tabId)) && current()) {
      await api.drawPageQuotes(tabId, quotes, url);
    }
  } catch {
    // Page status is a convenience; a failed lookup must never disturb browsing.
  } finally {
    if (current()) {
      loads.delete(tabId);
    }
  }
}

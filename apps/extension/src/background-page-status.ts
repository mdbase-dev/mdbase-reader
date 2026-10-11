import { clearPageMark, markSavedPage } from "./page-badge.js";
import { pageStatusEnabledCached } from "./page-status.js";
import { pageStatusCollection, savedUrlStatus } from "./saved-url-index.js";

// The latest page load per tab: a slow lookup must not mark the page that replaced it.
const loads = new Map<number, number>();
let nextLoad = 0;

/**
 * With the page-status setting, marks pages saved in the selected collection with a ✓
 * badge. The SDK runs only in the extension's pages, so the worker reads the saved-URL
 * index the side panel keeps (an older index still marks what it knows). The open panel
 * counts and draws the page's highlights itself.
 *
 * Every page load in every tab wakes the worker for this, so it only reads storage.
 */
export async function updatePageStatus(tabId: number, url: string | undefined): Promise<void> {
  const load = ++nextLoad;
  loads.set(tabId, load);
  const current = (): boolean => loads.get(tabId) === load;
  try {
    // Tab badges outlive navigation, so a marked tab loses its mark on every page load.
    await clearPageMark(tabId);
    if (!url?.startsWith("https://") || !(await pageStatusEnabledCached())) {
      return;
    }
    const collectionId = await pageStatusCollection();
    if (!collectionId) {
      return;
    }
    const status = await savedUrlStatus(collectionId, url, Date.now(), Number.POSITIVE_INFINITY);
    if (status === "saved" && current()) {
      await markSavedPage(tabId, 0);
    }
  } catch {
    // Page status is a convenience; a failed lookup must never disturb browsing.
  } finally {
    if (current()) {
      loads.delete(tabId);
    }
  }
}

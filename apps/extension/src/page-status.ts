/**
 * On HTTPS pages already saved in the selected collection, Reader shows a toolbar badge
 * and draws the saved highlights, and an open side panel follows the active tab. All of it
 * rests on the `https://*\/*` host permission, which the manifest requests. Chrome still
 * lets the reader withhold it (site access "on click" or "on specific sites"), so Reader
 * asks rather than assumes.
 */
export const pageStatusOrigins = ["https://*/*"];

export function pageStatusEnabled(): Promise<boolean> {
  return chrome.permissions.contains({ origins: pageStatusOrigins });
}

let cached: Promise<boolean> | null = null;
let watchingCache = false;

/**
 * {@link pageStatusEnabled} for the service worker, which asks on every page load: it
 * asks Chrome once per worker lifetime, again only after the reader changes site access.
 */
export function pageStatusEnabledCached(): Promise<boolean> {
  if (!watchingCache) {
    watchingCache = true;
    const reset = (): void => {
      cached = null;
    };
    chrome.permissions.onAdded.addListener(reset);
    chrome.permissions.onRemoved.addListener(reset);
  }
  cached ??= pageStatusEnabled().catch(() => {
    cached = null;
    return false;
  });
  return cached;
}

/** For tests: forget the cached answer and its listeners. */
export function resetPageStatusCache(): void {
  cached = null;
  watchingCache = false;
}

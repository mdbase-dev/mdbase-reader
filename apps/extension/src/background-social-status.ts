import { normalizedSourceUrl } from "@mdbase-reader/core";

import { markSavedPosts } from "./page-badge.js";

import type { PageQuote } from "./page-annotations.js";
import type { PageStatusConnect } from "./page-status-connect.js";
import type { PostRef } from "@mdbase-reader/web-capture";

async function visiblePostRefs(tabId: number): Promise<readonly PostRef[] | null> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["social-page.js"] });
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => globalThis.mdbaseReaderSocialPage?.identities() ?? null,
    });
    return execution?.result ?? null;
  } catch {
    return null;
  }
}

/** Per-post lookup on continuously loading pages. The bridge owns the throttled observer. */
export async function updateSocialStatus(
  tabId: number,
  url: string,
  find: (url: string) => Promise<{ api: PageStatusConnect; quotes: readonly PageQuote[] } | null>,
  current: () => boolean,
): Promise<boolean> {
  const refs = await visiblePostRefs(tabId);
  if (!refs) {
    return false;
  }
  let api: PageStatusConnect | undefined;
  let saved = 0;
  const quotes = new Map<string, PageQuote>();
  const lookups = new Map<string, Awaited<ReturnType<typeof find>>>();
  const visible = new Set(refs.map((ref) => normalizedSourceUrl(ref.url)));
  for (const ref of refs) {
    const key = ref.sourceUrl ?? ref.url;
    if (!lookups.has(key)) {
      lookups.set(key, await find(key));
    }
    const found = lookups.get(key);
    if (!current()) {
      return true;
    }
    if (!found) {
      continue;
    }
    api = found.api;
    saved++;
    for (const quote of found.quotes) {
      const scoped = quote.postUrl ? quote : { ...quote, postUrl: ref.url };
      if (scoped.postUrl && visible.has(normalizedSourceUrl(scoped.postUrl))) {
        quotes.set(JSON.stringify(scoped), scoped);
      }
    }
  }
  if (current()) {
    if (saved) {
      await markSavedPosts(tabId, saved, quotes.size);
    }
    // Clear old highlights too, even when all the visible posts are unsaved.
    if (api) {
      await api.drawPageQuotes(tabId, [...quotes.values()], url);
    } else {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (expectedUrl: string) => globalThis.mdbaseReaderSocialPage?.draw([], expectedUrl),
        args: [url],
      });
    }
  }
  return true;
}

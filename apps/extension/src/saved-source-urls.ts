import { pageStatusEnabled } from "./page-status.js";
import { savedUrlIndexStale, writeSavedUrlIndex } from "./saved-url-index.js";

import type { ReaderConnectedCollection } from "@mdbase-reader/connect";

/** Every address the collection's sources were saved under (`url` and `original_url`). */
export async function savedSourceUrls(collection: ReaderConnectedCollection): Promise<string[]> {
  const urls: string[] = [];
  const add = (
    items: readonly { url?: string; properties?: Readonly<Record<string, unknown>> }[],
  ): void => {
    for (const item of items) {
      const original = item.properties?.["original_url"];
      for (const url of [item.url, original]) {
        if (typeof url === "string" && url.trim()) {
          urls.push(url);
        }
      }
    }
  };
  const { sources, collectionId } = collection;
  if (sources.listPages) {
    for await (const page of sources.listPages({ collectionId, limit: 1_000 })) {
      add(page.items);
    }
    return urls;
  }
  let cursor: string | undefined;
  do {
    const page = await sources.list({ collectionId, limit: 1_000, ...(cursor ? { cursor } : {}) });
    add(page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return urls;
}

/**
 * With the page-status setting on, rebuilds the saved-URL index the service worker marks
 * pages from. The SDK runs only in extension pages, so the panel keeps the index current.
 * Never rejects: page status is a convenience.
 */
export async function refreshSavedUrlIndex(collection: ReaderConnectedCollection): Promise<void> {
  try {
    const { collectionId } = collection;
    if (!(await pageStatusEnabled()) || !(await savedUrlIndexStale(collectionId))) {
      return;
    }
    await writeSavedUrlIndex(collectionId, await savedSourceUrls(collection));
  } catch {
    // The worker keeps the previous index until the next rebuild.
  }
}

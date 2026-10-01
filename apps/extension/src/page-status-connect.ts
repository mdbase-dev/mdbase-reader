import { sourceForUrl } from "./capture-model.js";
import {
  createExtensionSession,
  rememberedCollection,
  restoreCollection,
} from "./connect-session.js";
import { annotationQuotes, drawPageQuotes, type PageQuote } from "./page-annotations.js";

import type {
  ReaderConnectedCollection,
  ReaderPortableApplicationSession,
} from "@mdbase-reader/connect";

/**
 * The part of page status that needs Connect. The service worker loads it (with the
 * Connect SDK) only for pages its saved-URL index cannot rule out; see
 * background-page-status.ts and page-status-worker.ts.
 */
export interface PageStatusConnect {
  /** The selected collection, or null when none is connected. */
  selectedCollection(): Promise<ReaderConnectedCollection | null>;
  /** Every address the collection's sources were saved under (`url` and `original_url`). */
  savedSourceUrls(collection: ReaderConnectedCollection): Promise<string[]>;
  /** The saved highlights for a page, or null when the page is not saved. */
  savedQuotes(
    collection: ReaderConnectedCollection,
    url: string,
  ): Promise<readonly PageQuote[] | null>;
  drawPageQuotes(tabId: number, quotes: readonly PageQuote[], url: string): Promise<unknown>;
}

let session: Promise<ReaderPortableApplicationSession | null> | null = null;

/** One Connect session per service-worker lifetime, sharing the panel's stored grants. */
async function selectedCollection(): Promise<ReaderConnectedCollection | null> {
  session ??= (async () => {
    const created = (await createExtensionSession()).session;
    const outcome = await created.start();
    if (!outcome.ok) {
      return null;
    }
    await restoreCollection(created);
    return created;
  })().catch(() => null);
  const current = await session;
  if (!current) {
    session = null;
    return null;
  }
  const remembered = await rememberedCollection();
  const snapshot = current.getSnapshot();
  if (remembered && (!("collectionId" in snapshot) || snapshot.collectionId !== remembered)) {
    current.select(remembered);
  }
  return current.connectedCollection();
}

async function savedSourceUrls(collection: ReaderConnectedCollection): Promise<string[]> {
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

async function savedQuotes(
  collection: ReaderConnectedCollection,
  url: string,
): Promise<readonly PageQuote[] | null> {
  const source = await sourceForUrl(collection, url);
  if (!source) {
    return null;
  }
  const annotations = await collection.annotations.listForSource(
    collection.collectionId,
    source.id,
  );
  return annotationQuotes(annotations);
}

export const pageStatusConnect: PageStatusConnect = {
  selectedCollection,
  savedSourceUrls,
  savedQuotes,
  drawPageQuotes: (tabId, quotes, url) => drawPageQuotes(tabId, quotes, url),
};

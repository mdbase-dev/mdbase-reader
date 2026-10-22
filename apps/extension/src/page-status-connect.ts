import { sourceForUrl } from "./capture-model.js";
import { ensureOffscreenDocument, sdkHostGone } from "./offscreen-document.js";
import { annotationQuotes, drawPageQuotes, type PageQuote } from "./page-annotations.js";
import { createSdkClient, type SdkClient } from "./sdk-client.js";
import { broadcastLink } from "./sdk-rpc.js";
import { scopePostQuotes, storedSocialPost } from "./social-quotes.js";

import type { ReaderConnectedCollection } from "@mdbase-reader/connect";

/**
 * The part of page status that needs the SDK host. The service worker loads it only for
 * pages its saved-URL index cannot rule out; see background-page-status.ts and
 * page-status-worker.ts.
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

let client: Promise<SdkClient> | null = null;
/** How long a page load waits for the host to open the selected collection. */
const openTimeoutMs = 10_000;

/** Waits until the host's selected collection is READY, or settles without one. */
function readyCollection(current: SdkClient): Promise<ReaderConnectedCollection | null> {
  const { application } = current;
  const opening = (): boolean =>
    ["not_started", "starting", "opening"].includes(application.getSnapshot().status) ||
    application.getSnapshot().readiness.checking;
  return new Promise((resolve) => {
    const check = (): boolean => {
      const collection = current.connectedCollection();
      if (collection || !opening()) {
        resolve(collection);
        return true;
      }
      return false;
    };
    if (check()) {
      return;
    }
    const unsubscribe = application.subscribe(() => {
      if (check()) {
        finish();
      }
    });
    const timeout = setTimeout(() => {
      resolve(null);
      finish();
    }, openTimeoutMs);
    function finish(): void {
      clearTimeout(timeout);
      unsubscribe();
    }
  });
}

/**
 * The selected collection, from the extension's one SDK host (offscreen.ts), started on
 * demand. The worker never starts sign-in or changes the selection.
 */
async function selectedCollection(): Promise<ReaderConnectedCollection | null> {
  client ??= createSdkClient(broadcastLink(), {
    ensureHost: ensureOffscreenDocument,
    hostGone: sdkHostGone,
    openSignIn: () => undefined,
  });
  try {
    const current = await client;
    if (current.application.getSnapshot().status === "not_started") {
      await current.application.start();
    }
    return await readyCollection(current);
  } catch {
    client = null;
    return null;
  }
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
  return scopePostQuotes(annotationQuotes(annotations), storedSocialPost(source.properties));
}

export const pageStatusConnect: PageStatusConnect = {
  selectedCollection,
  savedSourceUrls,
  savedQuotes,
  drawPageQuotes: (tabId, quotes, url) => drawPageQuotes(tabId, quotes, url),
};

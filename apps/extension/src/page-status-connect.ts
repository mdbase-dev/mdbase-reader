import { createMdbase, type Mdbase } from "@mdbase-reader/connect/native";

import { sourceForUrl } from "./capture-model.js";
import { rememberedCollection } from "./collection-memory.js";
import { ensureOffscreenDocument } from "./offscreen-document.js";
import { annotationQuotes, drawPageQuotes, type PageQuote } from "./page-annotations.js";
import { extensionCollection } from "./sdk-collection.js";
import { extensionDeclaration, sessionBuild } from "./sdk-declaration.js";
import { scopePostQuotes, storedSocialPost } from "./social-quotes.js";

import type { ReaderConnectedCollection } from "@mdbase-reader/connect";

/**
 * The part of page status that starts the SDK only for
 * pages its saved-URL index cannot rule out; see background-page-status.ts.
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

let client: { application: Mdbase; collection: ReturnType<typeof extensionCollection> } | null =
  null;
/** How long a page load waits for the host to open the selected collection. */
const openTimeoutMs = 10_000;

/** Waits until the host's selected collection is READY, or settles without one. */
function readyCollection(
  current: NonNullable<typeof client>,
): Promise<ReaderConnectedCollection | null> {
  const { application } = current;
  const opening = (): boolean =>
    ["not_started", "starting", "opening"].includes(application.getSnapshot().status) ||
    application.getSnapshot().readiness.checking;
  return new Promise((resolve) => {
    const check = (): boolean => {
      const collection = current.collection.connectedCollection();
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

/** The worker selects explicitly: it has no document URL or Web Storage selection. */
async function selectedCollection(): Promise<ReaderConnectedCollection | null> {
  try {
    await ensureOffscreenDocument();
    if (!client) {
      const application = createMdbase(extensionDeclaration(), {
        session: { build: sessionBuild, host: false },
        followVisibility: false,
        signIn: {
          open: async (url) => {
            await chrome.tabs.create({ url });
          },
        },
      });
      application.setForeground(false);
      client = { application, collection: extensionCollection(application) };
    }
    const id = await rememberedCollection();
    if (!id) {
      return null;
    }
    await client.application.start();
    if (client.application.getSnapshot().selectedCollectionId !== id) {
      await client.application.select(id);
    }
    return await readyCollection(client);
  } catch {
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

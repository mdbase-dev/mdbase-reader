import { sourceForUrl } from "./capture-model.js";
import {
  createExtensionSession,
  rememberedCollection,
  restoreCollection,
} from "./connect-session.js";
import { annotationQuotes, pageAnnotations } from "./page-annotations.js";
import { clearPageMark, markSavedPage } from "./page-badge.js";
import { pageStatusEnabled } from "./page-status.js";

import type {
  ReaderConnectedCollection,
  ReaderPortableApplicationSession,
} from "@mdbase-reader/connect";

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

/**
 * With the opt-in page-status setting, marks pages saved in the selected collection
 * (badge: number of highlights, or ✓) and draws the saved highlights on them.
 * Without it, or before any collection is connected, it does nothing.
 */
export async function updatePageStatus(tabId: number, url: string): Promise<void> {
  try {
    // Tab badges outlive navigation, so every page load clears the previous page's mark.
    await clearPageMark(tabId);
    const collection = (await pageStatusEnabled()) ? await selectedCollection() : null;
    const source = collection ? await sourceForUrl(collection, url) : null;
    if (!collection || !source) {
      return;
    }
    const annotations = await collection.annotations.listForSource(
      collection.collectionId,
      source.id,
    );
    const quotes = annotationQuotes(annotations);
    await markSavedPage(tabId, quotes.length);
    if (quotes.length) {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: pageAnnotations,
        args: [{ action: "render", quotes, expectedUrl: url }],
      });
    }
  } catch {
    // Page status is a convenience; a failed lookup must never disturb browsing.
  }
}

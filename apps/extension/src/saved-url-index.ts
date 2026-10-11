import { normalizedSourceUrl } from "@mdbase-reader/core";

import { lastCollectionKey } from "./collection-memory.js";

/**
 * Which page addresses the selected collection has saved, kept per collection in
 * `chrome.storage.local` so the service worker can dismiss most page loads without
 * starting Connect. Entries are short hashes of the normalized source URL (the identity
 * `sourceForUrl` compares), so the index stays small and a collision only costs one
 * real lookup. Pages saved elsewhere (Reader, another browser) are missed until the
 * index is rebuilt, so it expires after {@link savedUrlIndexTtlMs}.
 */
export const savedUrlIndexTtlMs = 60 * 60_000;
const keyPrefix = "saved-urls:";
// The collection the worker last indexed, for when no collection was remembered.
const lastIndexedKey = "saved-urls-last";

interface StoredIndex {
  readonly refreshedAt: number;
  readonly urls: readonly string[];
}
interface LoadedIndex {
  readonly refreshedAt: number;
  readonly urls: ReadonlySet<string>;
}

export type SavedUrlStatus = "saved" | "unsaved" | "stale";

function indexKey(collectionId: string): string {
  return keyPrefix + collectionId;
}

/** cyrb53: a fast 53-bit string hash; a collision only costs one lookup. */
function hash(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The index entry for a page address, or null for values that are not URLs. */
export function savedUrlKey(url: string): string | null {
  try {
    return hash(normalizedSourceUrl(url));
  } catch {
    return null;
  }
}

function isStoredIndex(value: unknown): value is StoredIndex {
  return (
    typeof value === "object" &&
    value !== null &&
    "refreshedAt" in value &&
    typeof value.refreshedAt === "number" &&
    "urls" in value &&
    Array.isArray(value.urls)
  );
}

// Loaded once per context; other contexts' writes arrive through storage.onChanged.
const cache = new Map<string, Promise<LoadedIndex | null>>();
let collection: Promise<string | null> | null = null;
let watching = false;

function watchIndexes(): void {
  if (watching) {
    return;
  }
  watching = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }
    for (const key of Object.keys(changes)) {
      if (key === lastCollectionKey || key === lastIndexedKey) {
        collection = null;
      } else if (key.startsWith(keyPrefix)) {
        cache.delete(key.slice(keyPrefix.length));
      }
    }
  });
}

function loadIndex(collectionId: string): Promise<LoadedIndex | null> {
  watchIndexes();
  let loaded = cache.get(collectionId);
  if (!loaded) {
    const key = indexKey(collectionId);
    loaded = chrome.storage.local
      .get(key)
      .then(({ [key]: value }) =>
        isStoredIndex(value)
          ? {
              refreshedAt: value.refreshedAt,
              urls: new Set(value.urls.filter((url) => typeof url === "string")),
            }
          : null,
      )
      .catch(() => null);
    cache.set(collectionId, loaded);
  }
  return loaded;
}

/**
 * The collection page status follows: the one the reader chose last, or else the one the
 * worker last indexed (Connect may restore a selection that was never remembered).
 */
export function pageStatusCollection(): Promise<string | null> {
  watchIndexes();
  collection ??= chrome.storage.local
    .get([lastCollectionKey, lastIndexedKey])
    .then(({ [lastCollectionKey]: remembered, [lastIndexedKey]: indexed }) => {
      const value: unknown = remembered ?? indexed;
      return typeof value === "string" ? value : null;
    })
    .catch(() => null);
  return collection;
}

/** "stale" when there is no index yet or it has expired: only then must Connect be asked. */
export async function savedUrlStatus(
  collectionId: string,
  url: string,
  now = Date.now(),
): Promise<SavedUrlStatus> {
  const index = await loadIndex(collectionId);
  if (!index || now - index.refreshedAt >= savedUrlIndexTtlMs || now < index.refreshedAt) {
    return "stale";
  }
  const key = savedUrlKey(url);
  return key !== null && index.urls.has(key) ? "saved" : "unsaved";
}

/** Replaces the index with every address the collection's sources were saved under. */
export async function writeSavedUrlIndex(
  collectionId: string,
  urls: Iterable<string>,
  now = Date.now(),
): Promise<void> {
  const keys = new Set<string>();
  for (const url of urls) {
    const key = savedUrlKey(url);
    if (key !== null) {
      keys.add(key);
    }
  }
  watchIndexes();
  cache.set(collectionId, Promise.resolve({ refreshedAt: now, urls: keys }));
  await chrome.storage.local.set({
    [indexKey(collectionId)]: { refreshedAt: now, urls: [...keys] } satisfies StoredIndex,
    [lastIndexedKey]: collectionId,
  });
}

async function editIndex(
  collectionId: string,
  edit: (urls: Set<string>) => boolean,
): Promise<void> {
  const index = await loadIndex(collectionId);
  // Without an index there is nothing to correct: the next lookup rebuilds it in full.
  if (!index) {
    return;
  }
  const urls = new Set(index.urls);
  if (!edit(urls)) {
    return;
  }
  cache.set(collectionId, Promise.resolve({ refreshedAt: index.refreshedAt, urls }));
  await chrome.storage.local.set({
    [indexKey(collectionId)]: {
      refreshedAt: index.refreshedAt,
      urls: [...urls],
    } satisfies StoredIndex,
  });
}

/**
 * Records that a page was just saved, so the worker marks it at once instead of after
 * the next rebuild. The panel calls this after a successful save. Never rejects.
 */
export async function rememberSavedUrls(
  collectionId: string,
  urls: readonly (string | null | undefined)[],
): Promise<void> {
  const keys = urls.flatMap((url) => {
    const key = url ? savedUrlKey(url) : null;
    return key === null ? [] : [key];
  });
  await editIndex(collectionId, (index) => {
    const before = index.size;
    keys.forEach((key) => index.add(key));
    return index.size !== before;
  }).catch(() => undefined);
}

/** Drops an entry Connect no longer confirms (a deleted source, or a hash collision). */
export async function forgetSavedUrl(collectionId: string, url: string): Promise<void> {
  const key = savedUrlKey(url);
  if (key === null) {
    return;
  }
  await editIndex(collectionId, (index) => index.delete(key)).catch(() => undefined);
}

/** For tests: forget everything loaded in this context. */
export function resetSavedUrlIndexCache(): void {
  cache.clear();
  collection = null;
  watching = false;
}

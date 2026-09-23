import type { ReaderConnectedCollection } from "@mdbase-reader/connect";
import type { SourceSummary } from "@mdbase-reader/core";
import type { KeyValueStorage } from "@mdbase-reader/platform";

export function readerSourceUrl(source: Pick<SourceSummary, "collectionId" | "id">): string {
  const url = new URL("https://lab.mdbase-reader.pages.dev/");
  url.searchParams.set("collection", source.collectionId);
  url.searchParams.set("source", source.id);
  return url.href;
}

export async function sourceForUrl(
  collection: ReaderConnectedCollection,
  value: string,
): Promise<SourceSummary | null> {
  const normalized = normalizedUrl(value);
  if (collection.sources.listPages) {
    for await (const page of collection.sources.listPages({
      collectionId: collection.collectionId,
      limit: 200,
    })) {
      const match = page.items.find(
        (source) => source.url && sameNormalizedUrl(source.url, normalized),
      );
      if (match) {
        return match;
      }
    }
    return null;
  }
  return sourceForUrlByPages(collection, normalized);
}

async function sourceForUrlByPages(
  collection: ReaderConnectedCollection,
  normalized: string,
): Promise<SourceSummary | null> {
  let cursor: string | undefined;
  do {
    const page = await collection.sources.list({
      collectionId: collection.collectionId,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    const match = page.items.find(
      (source) => source.url && sameNormalizedUrl(source.url, normalized),
    );
    if (match) {
      return match;
    }
    cursor = page.nextCursor;
  } while (cursor);
  return null;
}

export function normalizedUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|fbclid$|gclid$)/iu.test(key)) {
      url.searchParams.delete(key);
    }
  }
  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/$/u, "");
  }
  return url.href.replace(/\/$/u, "");
}

export function sameNormalizedUrl(value: string, normalized: string): boolean {
  try {
    return normalizedUrl(value) === normalized;
  } catch {
    // Older and manually authored source records may contain DOI strings,
    // relative paths, or other non-URL identifiers. They are not duplicates
    // of a captured web page and must not prevent a new capture from saving.
    return false;
  }
}

export function localStorageAdapter(): KeyValueStorage {
  return {
    get: (key) => Promise.resolve(localStorage.getItem(key)),
    set: (key, value) => {
      localStorage.setItem(key, value);
      return Promise.resolve();
    },
    remove: (key) => {
      localStorage.removeItem(key);
      return Promise.resolve();
    },
  };
}

export function tabIdParameter(locationUrl = location.href): number {
  const value = Number.parseInt(new URL(locationUrl).searchParams.get("tab") ?? "", 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Reader did not receive an active browser tab.");
  }
  return value;
}

export function problemMessage(reason: unknown): string {
  if (!(reason instanceof Error)) {
    return String(reason);
  }
  const messages = [reason.message];
  let cause: unknown = reason.cause;
  while (cause instanceof Error && messages.length < 4) {
    if (!messages.includes(cause.message)) {
      messages.push(cause.message);
    }
    cause = cause.cause;
  }
  return messages.join(" — ");
}

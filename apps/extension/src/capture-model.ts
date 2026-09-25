import { normalizedSourceUrl, sameSourceUrl, type SourceSummary } from "@mdbase-reader/core";

import { environment } from "./environment.js";

import type { ReaderConnectedCollection } from "@mdbase-reader/connect";

export function readerSourceUrl(source: Pick<SourceSummary, "collectionId" | "id">): string {
  const url = new URL(`${environment.readerOrigin}/`);
  url.searchParams.set("collection", source.collectionId);
  url.searchParams.set("source", source.id);
  return url.href;
}

/** Reader's library, opened on `collectionId` when one is selected. */
export function readerLibraryUrl(collectionId?: string | null): string {
  const url = new URL(`${environment.readerOrigin}/`);
  if (collectionId) {
    url.searchParams.set("collection", collectionId);
  }
  return url.href;
}

/** Uses the store's URL lookup; older repositories fall back to a paged scan. */
export async function sourceForUrl(
  collection: ReaderConnectedCollection,
  value: string,
  alternates: readonly string[] = [],
): Promise<SourceSummary | null> {
  const urls = [...new Set([value, ...alternates])];
  const { sources } = collection;
  if (sources.findByUrl) {
    for (const url of urls) {
      const found = await sources.findByUrl(collection.collectionId, url);
      if (found) {
        return found;
      }
    }
    return null;
  }
  const normalized = urls.map(normalizedSourceUrl);
  const matches = (source: SourceSummary): boolean =>
    source.url !== undefined && normalized.some((url) => sameSourceUrl(source.url ?? "", url));
  let cursor: string | undefined;
  do {
    const page = await sources.list({
      collectionId: collection.collectionId,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    const match = page.items.find(matches);
    if (match) {
      return match;
    }
    cursor = page.nextCursor;
  } while (cursor);
  return null;
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

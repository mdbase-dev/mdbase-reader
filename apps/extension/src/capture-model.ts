import { describeError } from "@mdbase-reader/connect/native";
import {
  normalizedSourceUrl,
  sameSourceUrl,
  type Annotation,
  type SourceSummary,
} from "@mdbase-reader/core";

import { environment } from "./environment.js";

import type { ReaderConnectedCollection } from "@mdbase-reader/connect";

export function readerSourceUrl(source: Pick<SourceSummary, "collectionId" | "id">): string {
  const url = new URL(`${environment.readerOrigin}/`);
  url.searchParams.set("collection", source.collectionId);
  url.searchParams.set("source", source.id);
  return url.href;
}

/** The source in Reader with `annotation` revealed, named by record path where it has one. */
export function readerAnnotationUrl(
  source: Pick<SourceSummary, "collectionId" | "id">,
  annotation: Pick<Annotation, "id" | "path">,
): string {
  const url = new URL(readerSourceUrl(source));
  url.searchParams.set("annotation", annotation.path ?? annotation.id);
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
    // Asked together, answered in order: the canonical URL wins, as it would asked alone.
    const lookups = urls.map(
      (url) => sources.findByUrl?.(collection.collectionId, url) ?? Promise.resolve(null),
    );
    for (const lookup of lookups) {
      // Later lookups are not awaited once an earlier one answers.
      lookup.catch(() => undefined);
    }
    for (const lookup of lookups) {
      const found = await lookup;
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

/**
 * A failure the panel words itself, plainly enough to show as it is. Any other failure is
 * summarised by the panel, with its own message kept under Technical details.
 */
export class PlainError extends Error {}

/** The plain summary of a failure, when it has one. */
export function plainMessage(reason: unknown): string | null {
  return reason instanceof PlainError ? reason.message : null;
}

export function problemMessage(reason: unknown): string {
  if (!(reason instanceof Error)) {
    return String(reason);
  }
  // SDK errors carry codes; people see the SDK's description, never the code.
  if (reason.name === "MdbaseError") {
    const described = describeError(reason);
    if (described) {
      return described.message;
    }
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

import type { ReaderConnectedCollection } from "@mdbase-reader/connect";
import type { Annotation } from "@mdbase-reader/core";

/**
 * Tags to suggest while typing, so `ml`, `ML` and `machine-learning` do not drift apart.
 * Connect has no tag index, so this is a bounded sample: tags the reader saved from this
 * browser, the page's own highlights, and one page of the collection's sources.
 */
const sampledSources = 200;
const rememberedLimit = 200;

function tagsKey(collectionId: string): string {
  return `tags:${collectionId}`;
}

export function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** Most frequent first; the first spelling seen wins for tags that differ only in case. */
export function rankTags(groups: readonly (readonly string[])[]): string[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const tags of groups) {
    for (const tag of tags) {
      const key = tag.toLocaleLowerCase();
      const entry = counts.get(key);
      if (entry) {
        entry.count++;
      } else {
        counts.set(key, { tag, count: 1 });
      }
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).map(({ tag }) => tag);
}

export async function loadKnownTags(
  collection: ReaderConnectedCollection,
  annotations: readonly Annotation[],
): Promise<string[]> {
  const [remembered, sources] = await Promise.all([
    rememberedTags(collection.collectionId),
    collection.sources
      .list({ collectionId: collection.collectionId, limit: sampledSources })
      .then((page) => page.items)
      .catch(() => []),
  ]);
  // Remembered tags are the reader's own spelling, so they come first.
  return rankTags([
    remembered,
    remembered,
    ...annotations.map((annotation) => annotation.tags),
    ...sources.map((source) => source.tags),
  ]);
}

async function rememberedTags(collectionId: string): Promise<string[]> {
  try {
    const key = tagsKey(collectionId);
    const { [key]: value } = await chrome.storage.local.get(key);
    return Array.isArray(value) ? value.filter((tag) => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

export async function rememberTags(collectionId: string, tags: readonly string[]): Promise<void> {
  if (!tags.length) {
    return;
  }
  const key = tagsKey(collectionId);
  const earlier = await rememberedTags(collectionId);
  const lower = new Set(tags.map((tag) => tag.toLocaleLowerCase()));
  const next = [...tags, ...earlier.filter((tag) => !lower.has(tag.toLocaleLowerCase()))];
  await chrome.storage.local.set({ [key]: next.slice(0, rememberedLimit) }).catch(() => undefined);
}

/** Known tags matching the tag being typed (after the last comma), minus those already entered. */
export function tagSuggestions(value: string, known: readonly string[], limit = 6): string[] {
  const parts = value.split(",");
  const typing = (parts.at(-1) ?? "").trim().toLocaleLowerCase();
  if (!typing) {
    return [];
  }
  const entered = new Set(parts.slice(0, -1).map((tag) => tag.trim().toLocaleLowerCase()));
  return known
    .filter((tag) => {
      const lower = tag.toLocaleLowerCase();
      return (
        !entered.has(lower) &&
        (lower.startsWith(typing) || lower.includes(`-${typing}`)) &&
        tag !== (parts.at(-1) ?? "").trim()
      );
    })
    .slice(0, limit);
}

/** Replaces the tag being typed with a suggestion, ready for the next one. */
export function acceptTag(value: string, tag: string): string {
  const parts = value
    .split(",")
    .slice(0, -1)
    .map((part) => part.trim())
    .filter(Boolean);
  return [...parts, tag].join(", ") + ", ";
}

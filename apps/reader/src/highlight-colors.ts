import {
  defaultHighlightColor,
  highlightColorKey,
  highlightColorKeys,
  highlightPalette,
  isHighlightColorKey,
  normalizeHighlightColor,
  type HighlightColorKey,
} from "@mdbase-reader/core";
import { useSyncExternalStore, type CSSProperties } from "react";

/**
 * Per-device highlight preferences: the colour used last, which H and the composer save in, and
 * what each colour means to this reader ("Key idea", "Question"). Neither is part of the
 * collection: a meaning is a private reading habit, and annotation records keep only the colour.
 */
export type HighlightMeanings = Readonly<Partial<Record<HighlightColorKey, string>>>;

const colorKey = "mdbase-reader:highlight-color";
const meaningsKey = "mdbase-reader:highlight-meanings";
/** Longer meanings would not fit a tooltip or a card's meta line. */
export const highlightMeaningMaxLength = 40;
/** Placeholders only: nothing is assigned until the reader writes it. */
export const highlightMeaningSuggestions: Readonly<Record<HighlightColorKey, string>> = {
  yellow: "Key idea",
  green: "Evidence",
  blue: "Definition",
  pink: "Question",
  purple: "To follow up",
};

const listeners = new Set<() => void>();
// Private windows may refuse storage; choices then last until the page reloads.
const unstored = new Map<string, string>();

function read(key: string): string | null {
  const local = unstored.get(key);
  if (local !== undefined) {
    return local;
  }
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    globalThis.localStorage.setItem(key, value);
    unstored.delete(key);
  } catch {
    unstored.set(key, value);
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === colorKey || event.key === meaningsKey) {
      listener();
    }
  };
  globalThis.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    globalThis.removeEventListener("storage", onStorage);
  };
}

export function lastHighlightColor(): HighlightColorKey {
  const value = read(colorKey);
  return isHighlightColorKey(value) ? value : defaultHighlightColor;
}

export function setLastHighlightColor(color: HighlightColorKey): void {
  if (color !== lastHighlightColor()) {
    write(colorKey, color);
  }
}

export function useLastHighlightColor(): HighlightColorKey {
  return useSyncExternalStore(subscribe, lastHighlightColor, () => defaultHighlightColor);
}

let parsed: { readonly raw: string | null; readonly value: HighlightMeanings } = {
  raw: null,
  value: {},
};

/** Each colour's meaning; blank and unknown entries are dropped. The object is stable. */
export function highlightMeanings(): HighlightMeanings {
  const raw = read(meaningsKey);
  if (raw !== parsed.raw) {
    parsed = { raw, value: parseMeanings(raw) };
  }
  return parsed.value;
}

function parseMeanings(raw: string | null): HighlightMeanings {
  let value: unknown;
  try {
    value = raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const meanings: Partial<Record<HighlightColorKey, string>> = {};
  for (const key of highlightColorKeys) {
    const meaning = cleanMeaning((value as Record<string, unknown>)[key]);
    if (meaning) {
      meanings[key] = meaning;
    }
  }
  return meanings;
}

function cleanMeaning(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\s+/gu, " ").trim().slice(0, highlightMeaningMaxLength)
    : "";
}

/** Renames a colour's meaning; an empty name clears it. */
export function setHighlightMeaning(color: HighlightColorKey, meaning: string): void {
  const next: HighlightMeanings = { ...highlightMeanings(), [color]: cleanMeaning(meaning) };
  const kept = highlightColorKeys.flatMap((key) => {
    const value = next[key];
    return value ? [[key, value] as const] : [];
  });
  write(meaningsKey, JSON.stringify(Object.fromEntries(kept)));
}

export function useHighlightMeanings(): HighlightMeanings {
  return useSyncExternalStore(subscribe, highlightMeanings, () => emptyMeanings);
}
const emptyMeanings: HighlightMeanings = {};

/**
 * What to call a stored colour, in words: "Yellow — Key idea", "Green", or for a hex colour
 * from another app, "Custom colour". Missing and unknown colours are yellow.
 */
export function highlightColorName(color: string | undefined, meanings: HighlightMeanings): string {
  const key = highlightColorKey(color);
  if (!key) {
    return "Custom colour";
  }
  const meaning = meanings[key];
  return meaning ? `${highlightPalette[key].label} — ${meaning}` : highlightPalette[key].label;
}

/** The meaning alone, for a card's meta line; null when the colour has none. */
export function highlightMeaning(
  color: string | undefined,
  meanings: HighlightMeanings,
): string | null {
  const key = highlightColorKey(color);
  return key ? (meanings[key] ?? null) : null;
}

/**
 * What lets CSS colour something by a highlight's colour: a palette key names it through
 * `data-highlight-color`; a hex colour from another app sets the wash and ink inline.
 */
export function highlightColorProps(color: string | undefined): {
  readonly "data-highlight-color": string;
  readonly style?: CSSProperties;
} {
  const key = highlightColorKey(color);
  if (key) {
    return { "data-highlight-color": key };
  }
  const value = normalizeHighlightColor(color);
  return {
    "data-highlight-color": "custom",
    style: {
      "--hl": `color-mix(in srgb, ${value} 38%, var(--bg-surface))`,
      "--hl-ink": value,
    } as CSSProperties,
  };
}

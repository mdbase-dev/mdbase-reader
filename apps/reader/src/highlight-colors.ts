import { t as translate } from "@lingui/core/macro";
import {
  readerHighlightSettings,
  type AppSettingsSnapshot,
  type ReaderHighlightSettings,
  type ReaderSettingsValues,
} from "@mdbase-reader/connect";
import {
  defaultHighlightColor,
  highlightColorKey,
  highlightColorKeys,
  highlightPalette,
  isHighlightColorKey,
  normalizeHighlightColor,
  offeredHighlightColor,
  readHighlightMeanings,
  type HighlightColorKey,
  type HighlightMeanings,
} from "@mdbase-reader/core";
import { useSyncExternalStore, type CSSProperties } from "react";

export { highlightMeaningMaxLength, type HighlightMeanings } from "@mdbase-reader/core";

/**
 * Highlight colours in Reader. Which colours are offered, in what order, and what each means
 * belong to the collection's settings record (`docs/design/app-settings.md`), so every device
 * and the extension agree; annotation records keep only the colour, so a new meaning relabels
 * every highlight of that colour. The colour used last, which H and the composer save in, is
 * this device's own.
 *
 * Meanings used to be kept on each device. Until the collection holds meanings, a device that
 * has its own keeps showing them, and the Highlight colours dialog offers to share them.
 */
const colorKey = "mdbase-reader:highlight-color";
const deviceMeaningsKey = "mdbase-reader:highlight-meanings";
/** Placeholders only: nothing is assigned until the reader writes it. */
export const highlightMeaningSuggestions: Readonly<Record<HighlightColorKey, string>> = {
  get yellow() {
    return translate`Key idea`;
  },
  get green() {
    return translate`Evidence`;
  },
  get blue() {
    return translate`Definition`;
  },
  get pink() {
    return translate`Question`;
  },
  get purple() {
    return translate`To follow up`;
  },
};

export interface HighlightChoices {
  /** The colours offered when making or recolouring a highlight, in order. At least one. */
  readonly colors: readonly HighlightColorKey[];
  readonly meanings: HighlightMeanings;
  /** The meanings are this device's own, from before they were collection settings. */
  readonly meaningsFromDevice: boolean;
}

/** Where the open collection's settings come from: its settings store. */
export interface HighlightSettingsSource {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => AppSettingsSnapshot<ReaderSettingsValues>;
}

const defaultSettings: ReaderHighlightSettings = {
  colors: highlightColorKeys,
  meanings: {},
  meaningsStored: false,
};

const listeners = new Set<() => void>();
// Private windows may refuse storage; choices then last until the page reloads.
const unstored = new Map<string, string | null>();
let collection: ReaderHighlightSettings = defaultSettings;

function notify(): void {
  listeners.forEach((listener) => listener());
}

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

function write(key: string, value: string | null): void {
  try {
    if (value === null) {
      globalThis.localStorage.removeItem(key);
    } else {
      globalThis.localStorage.setItem(key, value);
    }
    unstored.delete(key);
  } catch {
    unstored.set(key, value);
  }
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === colorKey || event.key === deviceMeaningsKey || event.key === null) {
      listener();
    }
  };
  globalThis.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    globalThis.removeEventListener("storage", onStorage);
  };
}

/**
 * Follow the open collection's settings: its colours and meanings apply everywhere at once,
 * including edits from other devices as the store hears of them. Returns the way to stop, which
 * goes back to Reader's defaults.
 */
export function bindHighlightSettings(source: HighlightSettingsSource): () => void {
  const take = (): void => {
    const next = readerHighlightSettings(source.getSnapshot().settings);
    if (JSON.stringify(next) !== JSON.stringify(collection)) {
      collection = next;
      notify();
    }
  };
  take();
  const unsubscribe = source.subscribe(take);
  return () => {
    unsubscribe();
    if (collection !== defaultSettings) {
      collection = defaultSettings;
      notify();
    }
  };
}

let parsedDevice: { readonly raw: string | null; readonly value: HighlightMeanings } = {
  raw: null,
  value: {},
};

/** The meanings this device kept before they were collection settings; usually none. */
export function deviceHighlightMeanings(): HighlightMeanings {
  const raw = read(deviceMeaningsKey);
  if (raw !== parsedDevice.raw) {
    let value: unknown;
    try {
      value = raw ? JSON.parse(raw) : {};
    } catch {
      value = {};
    }
    parsedDevice = { raw, value: readHighlightMeanings(value) };
  }
  return parsedDevice.value;
}

/** Once the collection holds meanings, this device's old ones are no longer needed. */
export function forgetDeviceHighlightMeanings(): void {
  if (read(deviceMeaningsKey) !== null) {
    write(deviceMeaningsKey, null);
  }
}

let cachedChoices: {
  readonly collection: ReaderHighlightSettings;
  readonly device: HighlightMeanings;
  readonly value: HighlightChoices;
} | null = null;

/** The colours offered and what they mean, for the open collection. The object is stable. */
export function highlightChoices(): HighlightChoices {
  const device = deviceHighlightMeanings();
  if (cachedChoices?.collection !== collection || cachedChoices.device !== device) {
    const fromDevice = !collection.meaningsStored && Object.keys(device).length > 0;
    cachedChoices = {
      collection,
      device,
      value: {
        colors: collection.colors,
        meanings: fromDevice ? device : collection.meanings,
        meaningsFromDevice: fromDevice,
      },
    };
  }
  return cachedChoices.value;
}

const defaultChoices: HighlightChoices = {
  colors: highlightColorKeys,
  meanings: {},
  meaningsFromDevice: false,
};

export function useHighlightChoices(): HighlightChoices {
  return useSyncExternalStore(subscribe, highlightChoices, () => defaultChoices);
}

/** Each colour's meaning; a colour without one is absent. */
export function useHighlightMeanings(): HighlightMeanings {
  return useHighlightChoices().meanings;
}

function preferredHighlightColor(): HighlightColorKey {
  const value = read(colorKey);
  return isHighlightColorKey(value) ? value : defaultHighlightColor;
}

/**
 * The colour a new highlight takes: the one used last on this device, or the first colour the
 * collection offers while that one is hidden.
 */
export function lastHighlightColor(): HighlightColorKey {
  return offeredHighlightColor(preferredHighlightColor(), highlightChoices().colors);
}

export function setLastHighlightColor(color: HighlightColorKey): void {
  if (color !== preferredHighlightColor()) {
    write(colorKey, color);
  }
}

export function useLastHighlightColor(): HighlightColorKey {
  return useSyncExternalStore(subscribe, lastHighlightColor, () => defaultHighlightColor);
}

/**
 * What to call a stored colour, in words: "Yellow — Key idea", "Green", or for a hex colour
 * from another app, "Custom colour". Missing and unknown colours are yellow.
 */
export function highlightColorName(color: string | undefined, meanings: HighlightMeanings): string {
  const key = highlightColorKey(color);
  if (!key) {
    return translate({ message: "Custom colour" });
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

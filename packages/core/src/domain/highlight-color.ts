/**
 * The five highlight colours, shared by every renderer, Reader and the extension. Each has a
 * wash, drawn behind text, and an ink, for margin bars and swatches, in a light and a dark
 * scheme. The values are the sRGB equivalents of the OKLCH tokens in Reader's
 * reader-tokens.css (docs/design-direction.md); a test keeps the two in step.
 *
 * Contrast (OKLCH -> sRGB luminance): body text keeps at least 12:1 against every light wash
 * and 7:1 against every dark wash. Light yellow ink is only 2.2:1 against a raised surface, so
 * swatches carry an inner ring and a name, never colour alone.
 */
export const highlightColorKeys = ["yellow", "green", "blue", "pink", "purple"] as const;
export type HighlightColorKey = (typeof highlightColorKeys)[number];

/** Missing and unrecognised colours draw as yellow. */
export const defaultHighlightColor: HighlightColorKey = "yellow";

export interface HighlightShade {
  /** Behind text. */
  readonly wash: string;
  /** Margin bars, swatches and outlines. */
  readonly ink: string;
}

export interface HighlightColorSpec {
  /** A palette key, or null for a stored hex colour outside the palette. */
  readonly key: HighlightColorKey | null;
  /** What to call it: "Yellow", or the hex value itself. */
  readonly label: string;
  readonly light: HighlightShade;
  readonly dark: HighlightShade;
  /**
   * How opaque the wash is drawn. Palette washes are pale enough to sit fully behind text; a
   * stored hex colour may be saturated, so it is drawn translucently, as it always was.
   */
  readonly washOpacity: number;
}

export const highlightPalette: Readonly<Record<HighlightColorKey, HighlightColorSpec>> = {
  yellow: {
    key: "yellow",
    label: "Yellow",
    light: { wash: "#f9e596", ink: "#e0a61e" },
    dark: { wash: "#5b4810", ink: "#edc14d" },
    washOpacity: 1,
  },
  green: {
    key: "green",
    label: "Green",
    light: { wash: "#c0f2c9", ink: "#459f5d" },
    dark: { wash: "#2c4e34", ink: "#73c385" },
    washOpacity: 1,
  },
  blue: {
    key: "blue",
    label: "Blue",
    light: { wash: "#bfe8ff", ink: "#3786c3" },
    dark: { wash: "#274863", ink: "#6cb2ec" },
    washOpacity: 1,
  },
  pink: {
    key: "pink",
    label: "Pink",
    light: { wash: "#ffd1e3", ink: "#c95a8b" },
    dark: { wash: "#623447", ink: "#e98db2" },
    washOpacity: 1,
  },
  purple: {
    key: "purple",
    label: "Purple",
    light: { wash: "#e5d8ff", ink: "#8160b5" },
    dark: { wash: "#473b5e", ink: "#b298e3" },
    washOpacity: 1,
  },
};

const hexColor = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/u;

export function isHighlightColorKey(value: unknown): value is HighlightColorKey {
  return typeof value === "string" && (highlightColorKeys as readonly string[]).includes(value);
}

/**
 * The colour to draw for a stored value: a palette key (any case), a hex colour, or yellow when
 * the value is missing or not recognised. Only drawing is normalised; the stored value is left
 * as it was written, so another app's colour survives a round trip through Reader.
 */
export function normalizeHighlightColor(value: string | null | undefined): string {
  const color = value?.trim().toLowerCase() ?? "";
  return isHighlightColorKey(color) || hexColor.test(color) ? color : defaultHighlightColor;
}

/** The palette key a stored value draws as, or null for a hex colour outside the palette. */
export function highlightColorKey(value: string | null | undefined): HighlightColorKey | null {
  const color = normalizeHighlightColor(value);
  return isHighlightColorKey(color) ? color : null;
}

/** Wash and ink for a stored value in both schemes. */
export function highlightColorSpec(value: string | null | undefined): HighlightColorSpec {
  const color = normalizeHighlightColor(value);
  if (isHighlightColorKey(color)) {
    return highlightPalette[color];
  }
  const shade = { wash: color, ink: color };
  return { key: null, label: color, light: shade, dark: shade, washOpacity: 0.38 };
}

/**
 * What each colour means in a collection ("Key idea", "Question"). Annotations store only the
 * colour key, so a meaning names every highlight of its colour, old and new.
 */
export type HighlightMeanings = Readonly<Partial<Record<HighlightColorKey, string>>>;

/** Longer meanings would not fit a tooltip or a card's meta line. */
export const highlightMeaningMaxLength = 40;

/** A meaning as stored: spaces collapsed, trimmed and clipped; "" when there is none. */
export function cleanHighlightMeaning(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\s+/gu, " ").trim().slice(0, highlightMeaningMaxLength)
    : "";
}

/**
 * The meanings a stored object gives, in palette order. Unknown colours and blank or non-text
 * meanings are dropped; anything but an object gives none.
 */
export function readHighlightMeanings(value: unknown): HighlightMeanings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const meanings: Partial<Record<HighlightColorKey, string>> = {};
  for (const key of highlightColorKeys) {
    const meaning = cleanHighlightMeaning((value as Record<string, unknown>)[key]);
    if (meaning) {
      meanings[key] = meaning;
    }
  }
  return meanings;
}

/**
 * The colours a stored list offers, in its order: palette keys only, each once. Unknown entries,
 * such as a colour from a newer Reader, are skipped. May be empty.
 */
export function readHighlightColorList(value: unknown): readonly HighlightColorKey[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const colors: HighlightColorKey[] = [];
  for (const entry of value) {
    if (isHighlightColorKey(entry) && !colors.includes(entry)) {
      colors.push(entry);
    }
  }
  return colors;
}

/**
 * The colour a new highlight takes: the preferred one while it is offered, else the first
 * colour offered. The preference itself is kept until a highlight is made, so showing its
 * colour again before then brings it back.
 */
export function offeredHighlightColor(
  preferred: HighlightColorKey,
  offered: readonly HighlightColorKey[],
): HighlightColorKey {
  return offered.includes(preferred) ? preferred : (offered[0] ?? preferred);
}

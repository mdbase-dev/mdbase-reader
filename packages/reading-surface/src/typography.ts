import type { ReadingTypography } from "./types.js";

export const defaultReadingTypography: ReadingTypography = {
  scale: 1,
  measure: "standard",
  face: "serif",
};

/** Characters per line for each measure, used by reflowable renderers. */
export const readingMeasureCharacters: Record<ReadingTypography["measure"], number> = {
  narrow: 56,
  standard: 66,
  wide: 80,
};

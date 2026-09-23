import { readingMeasureCharacters } from "@mdbase-reader/reading-surface";

import type { ReadingTypography } from "@mdbase-reader/reading-surface";

const faces: Record<ReadingTypography["face"], string> = {
  serif: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
};

/** Overrides the saved page's base size, face and measure with the reader's settings. */
export function applyHtmlTypography(document: Document, typography: ReadingTypography): void {
  let style = document.head.querySelector<HTMLStyleElement>(
    "style[data-mdbase-reader='typography']",
  );
  if (!style) {
    style = document.createElement("style");
    style.dataset["mdbaseReader"] = "typography";
    document.head.append(style);
  }
  const scale = Math.max(0.8, Math.min(1.6, typography.scale));
  const measure = readingMeasureCharacters[typography.measure];
  style.textContent = `body { font-size: ${String(18 * scale)}px; font-family: ${faces[typography.face]}; max-width: calc(${String(measure)}ch + 6rem); }
    @media (max-width: 640px) { body { font-size: ${String(17 * scale)}px; } }`;
}

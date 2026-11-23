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
  // The page as a whole is zoomed, pictures and margins too, so that it lays out as it does at
  // full size. The narrow-window rule is about the pane's size before that zoom.
  const zoom = Math.max(0.1, Math.min(4, typography.zoom ?? 1));
  style.textContent = `${zoom === 1 ? "" : `html { zoom: ${String(zoom)}; }\n    `}body { font-size: ${String(18 * scale)}px; font-family: ${faces[typography.face]}; max-width: calc(${String(measure)}ch + 6rem); }
    @media (max-width: ${String(Math.round(640 * zoom))}px) { body { font-size: ${String(17 * scale)}px; } }`;
}

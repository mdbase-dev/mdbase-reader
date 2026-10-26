import { t as translate } from "@lingui/core/macro";

import type { ReadingStatus, SourceSummary } from "@mdbase-reader/core";

/**
 * How far through a source is, as a whole percentage, from what the record stores: the saved
 * `reading.progress`, else the position's own progression (a saved page's scroll, an EPUB
 * locator's `totalProgression`). Null when nothing records it.
 */
export function readingProgressValue(source: SourceSummary): number | null {
  const reading = source.reading;
  const position = reading?.position;
  const progress =
    reading?.progress ??
    (position?.kind === "html"
      ? position.progression
      : position?.kind === "epub"
        ? numberAt(position.locator, "locations", "totalProgression")
        : undefined);
  return progress === undefined || !Number.isFinite(progress)
    ? null
    : Math.round(Math.max(0, Math.min(1, progress)) * 100);
}

export function readingStatusOf(source: SourceSummary): ReadingStatus {
  return source.reading?.status ?? source.readingStatus ?? "inbox";
}

/**
 * Where the reader stopped, in words: "Page 42 of 300", an EPUB chapter's title, then the
 * percentage. The page count is known only once the PDF has been opened for its thumbnail.
 */
export function readingLocationLabel(source: SourceSummary, pageCount?: number): string {
  const position = source.reading?.position;
  const progress = readingProgressValue(source);
  const page =
    position?.kind === "pdf"
      ? pageCount !== undefined && pageCount > position.pageIndex
        ? translate`Page ${position.pageIndex + 1} of ${pageCount}`
        : translate`Page ${position.pageIndex + 1}`
      : null;
  const chapter =
    position?.kind === "epub" ? textAt(position.locator, "title")?.slice(0, 80) : undefined;
  return [page, chapter, progress === null ? null : `${String(progress)}%`]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/**
 * The text at the saved position, when the position carries it (a Readium locator's
 * highlighted text). Other formats store only a page or an offset, so they have none.
 */
export function readingPassage(source: SourceSummary): string | null {
  const position = source.reading?.position;
  if (position?.kind !== "epub") {
    return null;
  }
  const text = textAt(position.locator, "text", "highlight")?.replace(/\s+/gu, " ").trim();
  if (!text) {
    return null;
  }
  return text.length > 220 ? `${text.slice(0, 219).trimEnd()}…` : text;
}

function valueAt(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Readonly<Record<string, unknown>>)[key];
  }
  return current;
}

function numberAt(value: unknown, ...path: readonly string[]): number | undefined {
  const found = valueAt(value, path);
  return typeof found === "number" && Number.isFinite(found) ? found : undefined;
}

function textAt(value: unknown, ...path: readonly string[]): string | undefined {
  const found = valueAt(value, path);
  return typeof found === "string" && found.trim() ? found.trim() : undefined;
}

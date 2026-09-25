import type { JsonObject } from "@mdbase-dev/connect";
import type { ReadingPosition } from "@mdbase-reader/core";

function object(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

/** Reads the compact resume selector used by `reading.position` and bookmark targets. */
export function readingPositionFromFrontmatter(value: unknown): ReadingPosition | undefined {
  const candidate = object(value);
  const pdfPage = object(candidate?.["pdf"])?.["page_index"];
  if (typeof pdfPage === "number" && Number.isInteger(pdfPage) && pdfPage >= 0) {
    return { kind: "pdf", pageIndex: pdfPage };
  }
  const epubLocator = object(object(candidate?.["epub"])?.["locator"]);
  if (epubLocator) {
    return { kind: "epub", locator: epubLocator };
  }
  const html = object(candidate?.["html"]);
  const href = html?.["href"];
  const progression = html?.["progression"];
  return typeof href === "string" && href.trim().length > 0
    ? {
        kind: "html",
        href,
        ...(typeof progression === "number" ? { progression } : {}),
      }
    : undefined;
}

/** The compact resume selector stored as `reading.position`. */
export function positionFrontmatter(position: ReadingPosition): JsonObject {
  if (position.kind === "pdf") {
    return { pdf: { page_index: position.pageIndex } };
  }
  if (position.kind === "epub") {
    return { epub: { locator: position.locator as JsonObject } };
  }
  return {
    html: {
      href: position.href,
      ...(position.progression === undefined ? {} : { progression: position.progression }),
    },
  };
}

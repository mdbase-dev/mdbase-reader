import { readingOrderIndexFromCfi, stableEpubHref } from "./epub-locator.js";
import { resolveEpubPath, safeEpubPath } from "./epub-path.js";
import { epubRangeCfiPoint } from "./epub-range-cfi.js";

import type { DocumentRange } from "@mdbase-reader/core";
import type {
  ReaderLocator,
  ReadingRangeLocation,
  ReadingRangeResolution,
} from "@mdbase-reader/reading-surface";
import type { Publication } from "@readium/shared";

type SpineRange = Extract<DocumentRange, { kind: "epub-spine" }>;
interface ResolvedBounds {
  readonly hrefs: readonly string[];
  readonly startIndex: number;
  readonly endIndex: number;
  readonly start: number;
  readonly end: number;
  readonly documents: ReadonlyMap<number, Document>;
}

/** Validate without moving the navigator or changing its freely navigable publication. */
export async function resolveEpubReadingRange(
  publication: Publication,
  publicationBaseUrl: string,
  range: DocumentRange,
  packagePath = "package.opf",
): Promise<ReadingRangeResolution> {
  if (range.kind !== "epub-spine") {
    return { valid: false, message: "EPUB reading requires an epub-spine range." };
  }
  try {
    const hrefs = publication.readingOrder.items.map((link) =>
      stableEpubHref(link.href, publicationBaseUrl),
    );
    const startHref = resolveEpubPath(packagePath, rangeHref(range.start));
    const endHref = resolveEpubPath(packagePath, rangeHref(range.end));
    const startIndex = endpointIndex(hrefs, startHref);
    const endIndex = endpointIndex(hrefs, endHref);
    if (startIndex > endIndex) {
      throw new Error("EPUB range start follows its end in spine reading order.");
    }
    const documents = await endpointDocuments(publication, range, startIndex, endIndex);
    const start =
      range.start_cfi === undefined
        ? Number.NEGATIVE_INFINITY
        : epubRangeCfiPoint(range.start_cfi, startIndex, documents.get(startIndex), "start");
    const end =
      range.end_cfi === undefined
        ? Number.POSITIVE_INFINITY
        : epubRangeCfiPoint(range.end_cfi, endIndex, documents.get(endIndex), "end");
    if (start === null || end === null) {
      throw new Error(
        "EPUB range CFI is unsupported or does not resolve in its endpoint resource.",
      );
    }
    if (startIndex === endIndex && start > end) {
      throw new Error("EPUB range CFI start follows its end.");
    }
    const bounds: ResolvedBounds = { hrefs, startIndex, endIndex, start, end, documents };
    return {
      valid: true,
      start: {
        kind: "epub",
        locator: {
          href: startHref,
          type: publication.readingOrder.items[startIndex]?.type ?? "application/xhtml+xml",
          locations:
            range.start_cfi === undefined ? { progression: 0 } : { fragments: [range.start_cfi] },
        },
      },
      measure: (locator) => measureRange(bounds, locator),
    };
  } catch (error) {
    return {
      valid: false,
      message: error instanceof Error ? error.message : "EPUB reading range could not be verified.",
    };
  }
}

function endpointIndex(hrefs: readonly string[], href: string): number {
  const index = hrefs.indexOf(href);
  if (index < 0 || hrefs.lastIndexOf(href) !== index) {
    throw new Error("EPUB range endpoints must identify unique spine resources.");
  }
  return index;
}

async function endpointDocuments(
  publication: Publication,
  range: SpineRange,
  start: number,
  end: number,
): Promise<ReadonlyMap<number, Document>> {
  // Detached documents belong only to this resolution/session, never a shared renderer.
  const documents = new Map<number, Document>();
  for (const [index, cfi] of [
    [start, range.start_cfi],
    [end, range.end_cfi],
  ] as const) {
    if (cfi === undefined || documents.has(index)) {
      continue;
    }
    const link = publication.readingOrder.items[index];
    if (!link) {
      throw new Error("EPUB range resource is missing.");
    }
    const resource = publication.get(link);
    try {
      const markup = await resource.readAsString();
      if (!markup) {
        throw new Error("EPUB range resource could not be read.");
      }
      const document = new DOMParser().parseFromString(
        markup,
        link.type === "application/xhtml+xml" ? "application/xhtml+xml" : "text/html",
      );
      if (document.querySelector("parsererror")) {
        throw new Error("EPUB range resource could not be parsed.");
      }
      documents.set(index, document);
    } finally {
      resource.close();
    }
  }
  return documents;
}

function measureRange(bounds: ResolvedBounds, locator: ReaderLocator): ReadingRangeLocation | null {
  if (locator.kind !== "epub") {
    return null;
  }
  const location = absoluteLocation(bounds.hrefs, locator.locator);
  if (!location) {
    return null;
  }
  const { index, cfi } = location;
  if (index < bounds.startIndex) {
    return { position: "before", atEnd: false };
  }
  if (index > bounds.endIndex) {
    return { position: "after", atEnd: true };
  }
  const start = index === bounds.startIndex ? bounds.start : Number.NEGATIVE_INFINITY;
  const end = index === bounds.endIndex ? bounds.end : Number.POSITIVE_INFINITY;
  const point = cfi ? epubRangeCfiPoint(cfi, index, bounds.documents.get(index), "start") : null;
  return measureItem(start, end, point);
}

function measureItem(
  start: number,
  end: number,
  point: number | null,
): ReadingRangeLocation | null {
  // Readium progression/position/totalProgression are not logical text offsets.
  // In a partially included item they cannot even certify inside versus outside.
  if (point === null) {
    return Number.isFinite(start) || Number.isFinite(end)
      ? null
      : { position: "inside", atEnd: false };
  }
  if (point < start) {
    return { position: "before", atEnd: false };
  }
  if (point > end) {
    return { position: "after", atEnd: true };
  }
  return { position: "inside", atEnd: point === end };
}

function absoluteLocation(
  hrefs: readonly string[],
  value: Readonly<Record<string, unknown>>,
): { readonly index: number; readonly cfi: string | undefined } | null {
  const locations = record(value["locations"]);
  const fragments = locations?.["fragments"];
  const cfis = Array.isArray(fragments)
    ? fragments.filter(
        (fragment): fragment is string =>
          typeof fragment === "string" && fragment.startsWith("epubcfi("),
      )
    : [];
  if (cfis.length > 1) {
    return null;
  }
  const cfi = cfis[0];
  try {
    const href = value["href"];
    // CFI-only absolute locators are also used by saved selections.
    const cfiIndex = cfi === undefined ? null : readingOrderIndexFromCfi(cfi);
    const index = typeof href === "string" ? hrefs.indexOf(rangeHref(href)) : (cfiIndex ?? -1);
    if (index < 0 || index >= hrefs.length) {
      return null;
    }
    if (cfi !== undefined && cfiIndex !== index) {
      return null;
    }
    return { index, cfi };
  } catch {
    return null;
  }
}

/** Unlike navigation hrefs, range endpoints cannot be URLs, fragments or traversal. */
function rangeHref(value: string): string {
  const decoded = decodeURIComponent(value);
  if (
    decoded.length === 0 ||
    decoded !== decoded.trim() ||
    /[\\:#?]/u.test(decoded) ||
    Array.from(decoded).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    decoded.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("EPUB range href must be a safe package-relative resource path.");
  }
  return safeEpubPath(decoded);
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

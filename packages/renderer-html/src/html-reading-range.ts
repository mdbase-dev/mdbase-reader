import { htmlReadingInset } from "./html-scroll.js";

import type { DocumentRange } from "@mdbase-reader/core";
import type {
  ReaderLocator,
  ReadingRangeLocation,
  ReadingRangeResolution,
} from "@mdbase-reader/reading-surface";

type HtmlLocation =
  | { readonly kind: "fragment"; readonly element: Element }
  | { readonly kind: "scroll"; readonly progression: number };

/** IDs are data, never CSS selectors. Only one matching ID in the document is safe. */
export function htmlFragmentElement(document: Document, fragment: string): Element | null {
  if (!/^#\S+$/u.test(fragment)) {
    return null;
  }
  let id: string;
  try {
    id = decodeURIComponent(fragment.slice(1));
  } catch {
    return null;
  }
  const matches = [...document.querySelectorAll("[id]")].filter((element) => element.id === id);
  const element = matches.length === 1 ? matches[0] : undefined;
  return element && document.body.contains(element) ? element : null;
}

/** Preserve the renderer's absolute file href; do not interpret URLs or execute fragments. */
export function htmlLocationTarget(
  document: Document,
  href: string,
  locator: ReaderLocator,
): HtmlLocation | null {
  if (
    locator.kind !== "html" ||
    (locator.progression !== undefined &&
      (!Number.isFinite(locator.progression) || locator.progression < 0 || locator.progression > 1))
  ) {
    return null;
  }
  if (locator.href === href) {
    return { kind: "scroll", progression: locator.progression ?? 0 };
  }
  if (!locator.href.startsWith(`${href}#`)) {
    return null;
  }
  const element = htmlFragmentElement(document, locator.href.slice(href.length));
  return element ? { kind: "fragment", element } : null;
}

/** Validates loaded, inert HTML without changing its navigation or sandbox. */
export function resolveHtmlReadingRange(
  document: Document,
  href: string,
  range: DocumentRange,
): ReadingRangeResolution {
  if (range.kind !== "fragment") {
    return { valid: false, message: "HTML reading ranges require fragment IDs." };
  }
  const start = htmlFragmentElement(document, range.start);
  if (!start) {
    return { valid: false, message: "The start fragment must resolve to one ID in the HTML body." };
  }
  const end = range.end === undefined ? null : htmlFragmentElement(document, range.end);
  if (range.end !== undefined && !end) {
    return { valid: false, message: "The end fragment must resolve to one ID in the HTML body." };
  }
  // FOLLOWING is a DOM-order test, not a lexical ID or visual layout comparison.
  if (end && !(start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING)) {
    return {
      valid: false,
      message: "The end fragment must follow the start fragment in DOM order.",
    };
  }
  const interval = document.createRange();
  interval.setStartBefore(start);
  if (end) {
    interval.setEndBefore(end);
  } else {
    // No end means precisely this element's subtree, not the remaining document.
    interval.setEndAfter(start);
  }
  return {
    valid: true,
    start: { kind: "html", href: `${href}${range.start}` },
    measure(locator): ReadingRangeLocation | null {
      if (
        htmlFragmentElement(document, range.start) !== start ||
        (range.end !== undefined && htmlFragmentElement(document, range.end) !== end)
      ) {
        return null;
      }
      const target = htmlLocationTarget(document, href, locator);
      if (!target) {
        return null;
      }
      return target.kind === "fragment"
        ? measureFragment(document, interval, target.element)
        : measureScroll(document, start, end, target.progression);
    },
  };
}

function measureFragment(
  document: Document,
  interval: Range,
  element: Element,
): ReadingRangeLocation {
  const point = document.createRange();
  point.setStartBefore(element);
  point.collapse(true);
  const position =
    point.compareBoundaryPoints(Range.START_TO_START, interval) < 0
      ? "before"
      : point.compareBoundaryPoints(Range.END_TO_END, interval) >= 0
        ? "after"
        : "inside";
  const length = interval.toString().length;
  const prefix = interval.cloneRange();
  if (position === "inside") {
    prefix.setEndBefore(element);
  }
  const progress = length
    ? position === "before"
      ? 0
      : position === "after"
        ? 1
        : Math.max(0, Math.min(1, prefix.toString().length / length))
    : undefined;
  return {
    position,
    atEnd: position === "after" || progress === 1,
    ...(progress !== undefined ? { progress } : {}),
  };
}

function measureScroll(
  document: Document,
  start: Element,
  end: Element | null,
  progression: number,
): ReadingRangeLocation | null {
  // Legacy scroll fractions classify the reading edge, never content progress.
  if (!start.getClientRects().length || !(end ?? start).getClientRects().length) {
    return null;
  }
  const root = document.scrollingElement ?? document.documentElement;
  const startY = start.getBoundingClientRect().top + root.scrollTop;
  const boundary = (end ?? start).getBoundingClientRect();
  const endY = (end ? boundary.top : boundary.bottom) + root.scrollTop;
  if (!Number.isFinite(startY) || !Number.isFinite(endY) || endY <= startY) {
    return null;
  }
  const y = progression * Math.max(0, root.scrollHeight - root.clientHeight) + htmlReadingInset;
  if (!Number.isFinite(y)) {
    return null;
  }
  const position = y < startY ? "before" : y >= endY ? "after" : "inside";
  return { position, atEnd: position === "after" };
}

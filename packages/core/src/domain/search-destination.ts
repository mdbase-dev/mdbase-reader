import { matchTextQuote, textQuoteAt, type TextQuote } from "./text-quote-match.js";

import type { DocumentTarget } from "./document.js";
import type { QuoteSelector } from "./selector.js";

/** Portable evidence, independent of the index or renderer that found the match. */
export type SearchLocation =
  | { readonly kind: "pdf"; readonly pageIndex: number }
  | { readonly kind: "epub"; readonly href: string }
  | { readonly kind: "html" };

export interface SearchDestination {
  readonly document: DocumentTarget;
  readonly location: SearchLocation;
  readonly quote: QuoteSelector;
}

/** Text boundaries must not be crossed when creating a passage destination. */
export interface SearchTextSegment {
  readonly location: SearchLocation;
  readonly text: string;
}

export function searchDestinationMatchesDocument(
  destination: SearchDestination,
  document: DocumentTarget,
): boolean {
  return (
    destination.document.fileId === document.fileId &&
    destination.document.revision === document.revision
  );
}

/** Search navigation never uses annotations' approximate or ambiguous reanchoring. */
export function resolveSearchQuote(
  text: string,
  quote: TextQuote,
): { start: number; end: number } | null {
  const match = matchTextQuote(text, quote);
  return match && !match.ambiguous && !match.approximate ? match : null;
}

/** Mirrors whitespace-insensitive, case-insensitive excerpt search while retaining real text. */
export function searchQuote(text: string, query: string): QuoteSelector | null {
  const clean = text.replace(/\s+/gu, " ");
  const needle = query.trim().replace(/\s+/gu, " ");
  if (!needle) {
    return null;
  }
  // RegExp's case folding does not change string length (unlike locale lowercasing).
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const index = clean.search(new RegExp(escaped, "iu"));
  return index < 0 ? null : textQuoteAt(clean, index, index + needle.length);
}

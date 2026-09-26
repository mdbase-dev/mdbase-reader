import type { QuoteSelector } from "./selector.js";

/**
 * Anchoring text quotations in a document's text, shared by every surface that draws
 * annotations: Reader's saved copies and the live pages the extension highlights.
 *
 * The same quotation is matched against different copies of a page (the live DOM, the
 * extracted reading copy), which rarely agree character for character. Matching therefore
 * ignores whitespace and invisible characters, and falls back to an approximate match when
 * the copies differ inside the passage (a dropped button label or hidden span).
 */
export interface TextQuote {
  readonly exact: string;
  readonly prefix?: string | undefined;
  readonly suffix?: string | undefined;
}

export interface TextQuoteMatch {
  /** UTF-16 offsets into the text that was searched. */
  readonly start: number;
  readonly end: number;
  /** Another occurrence fits the recorded context as well as this one. */
  readonly ambiguous: boolean;
  /** The passage differs from the quotation; it was found approximately. */
  readonly approximate: boolean;
}

export const textQuoteContextLength = 64;

/** Surrounding text shared by only a few characters (a space, "the ") is coincidence. */
const minimumContext = 4;
/** Shorter quotations are too generic to find approximately. */
const minimumApproximateLength = 12;
const minimumAnchorLength = 6;
const maximumAnchorOccurrences = 50;
/** Beyond this, the edit distance is estimated from the span length. */
const maximumComparisonCells = 4_000_000;

/** Characters that differ between copies of a page without changing what it says. */
const ignorable = /[\s\u00ad\u200b-\u200d\u2060\ufeff]/u;

interface Normalized {
  readonly text: string;
  /** For each normalized character, its offset in the original text. */
  readonly offsets: readonly number[];
}

interface Candidate {
  readonly start: number;
  readonly end: number;
  readonly errors: number;
}

/** The quotation of `text` between two offsets, with surrounding context. */
export function textQuoteAt(text: string, start: number, end: number): QuoteSelector {
  const prefix = text.slice(Math.max(0, start - textQuoteContextLength), start);
  const suffix = text.slice(end, end + textQuoteContextLength);
  return {
    exact: text.slice(start, end),
    ...(prefix ? { prefix } : {}),
    ...(suffix ? { suffix } : {}),
  };
}

/** Finds one quotation in `text`. Use {@link textQuoteMatcher} for several. */
export function matchTextQuote(text: string, quote: TextQuote): TextQuoteMatch | null {
  return textQuoteMatcher(text)(quote);
}

/** Prepares `text` once for locating many quotations in it. */
export function textQuoteMatcher(text: string): (quote: TextQuote) => TextQuoteMatch | null {
  const haystack = normalize(text);
  return (quote) => {
    const needle = normalize(quote.exact).text;
    if (!needle) {
      return null;
    }
    const exact = occurrences(haystack.text, needle, Number.POSITIVE_INFINITY).map((start) => ({
      start,
      end: start + needle.length,
      errors: 0,
    }));
    const candidates = exact.length ? exact : approximate(haystack.text, needle);
    const best = choose(haystack.text, candidates, quote);
    if (!best) {
      return null;
    }
    const start = haystack.offsets[best.start];
    const last = haystack.offsets[best.end - 1];
    if (start === undefined || last === undefined) {
      return null;
    }
    return { start, end: last + 1, ambiguous: best.ambiguous, approximate: best.errors > 0 };
  };
}

function normalize(value: string): Normalized {
  let text = "";
  const offsets: number[] = [];
  for (let index = 0; index < value.length; index++) {
    const character = value.charAt(index);
    if (!ignorable.test(character)) {
      text += character;
      offsets.push(index);
    }
  }
  return { text, offsets };
}

function occurrences(text: string, needle: string, limit: number): number[] {
  const found: number[] = [];
  for (
    let index = text.indexOf(needle);
    index !== -1 && found.length < limit;
    index = text.indexOf(needle, index + 1)
  ) {
    found.push(index);
  }
  return found;
}

/**
 * The longest opening (or closing) part of the quotation found in the text, however far it
 * reaches before the copies diverge. Too short a part would anchor anywhere.
 */
function longestPresent(
  text: string,
  needle: string,
  part: (length: number) => string,
): string | null {
  let found = 0;
  let low = minimumAnchorLength;
  let high = needle.length - 1;
  while (low <= high) {
    const length = Math.floor((low + high) / 2);
    if (text.includes(part(length))) {
      found = length;
      low = length + 1;
    } else {
      high = length - 1;
    }
  }
  return found ? part(found) : null;
}

/**
 * Candidates anchored by the quotation's opening or closing words, accepted when the text
 * between is close enough. Passages anchored at both ends may differ more.
 */
function approximate(text: string, needle: string): Candidate[] {
  if (needle.length < minimumApproximateLength) {
    return [];
  }
  const head = longestPresent(text, needle, (length) => needle.slice(0, length));
  const tail = longestPresent(text, needle, (length) => needle.slice(needle.length - length));
  const heads = head ? occurrences(text, head, maximumAnchorOccurrences) : [];
  const tails = tail
    ? occurrences(text, tail, maximumAnchorOccurrences).map((index) => index + tail.length)
    : [];
  const bothAnchored = Math.floor(needle.length / 2);
  const oneAnchored = Math.floor(needle.length / 8);
  const spans = new Map<string, { start: number; end: number; allowed: number }>();
  const add = (start: number, end: number, allowed: number): void => {
    const key = `${String(start)}:${String(end)}`;
    if (start >= 0 && end <= text.length && end > start && !spans.has(key)) {
      spans.set(key, { start, end, allowed });
    }
  };
  for (const start of heads) {
    const ends = tails.filter((end) => Math.abs(end - start - needle.length) <= bothAnchored);
    for (const end of ends) {
      add(start, end, bothAnchored);
    }
    if (!ends.length) {
      add(start, start + needle.length, oneAnchored);
    }
  }
  for (const end of tails) {
    if (!heads.some((start) => Math.abs(end - start - needle.length) <= bothAnchored)) {
      add(end - needle.length, end, oneAnchored);
    }
  }
  return [...spans.values()].flatMap(({ start, end, allowed }) => {
    const errors = editDistance(needle, text.slice(start, end), allowed);
    return errors <= allowed ? [{ start, end, errors }] : [];
  });
}

/** The candidate that best fits the text and its recorded context. */
function choose(
  text: string,
  candidates: readonly Candidate[],
  quote: TextQuote,
): (Candidate & { readonly ambiguous: boolean }) | null {
  const prefix = normalize(quote.prefix ?? "").text;
  const suffix = normalize(quote.suffix ?? "").text;
  const scored = candidates
    .map((candidate) => ({
      ...candidate,
      context:
        commonSuffix(
          text.slice(Math.max(0, candidate.start - prefix.length), candidate.start),
          prefix,
        ) + commonPrefix(text.slice(candidate.end, candidate.end + suffix.length), suffix),
    }))
    .sort((a, b) => a.errors - b.errors || b.context - a.context);
  const [best, runnerUp] = scored;
  if (!best) {
    return null;
  }
  const ambiguous =
    runnerUp?.errors === best.errors &&
    (best.context < minimumContext || runnerUp.context === best.context);
  return { ...best, ambiguous };
}

/** Levenshtein distance, stopping early once it must exceed `limit`. */
function editDistance(left: string, right: string, limit: number): number {
  if (left.length * right.length > maximumComparisonCells) {
    return Math.abs(left.length - right.length);
  }
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row++) {
    const current = [row];
    let smallest = row;
    for (let column = 1; column <= right.length; column++) {
      const substitution =
        (previous[column - 1] ?? 0) + (left[row - 1] === right[column - 1] ? 0 : 1);
      const value = Math.min(
        (previous[column] ?? 0) + 1,
        (current[column - 1] ?? 0) + 1,
        substitution,
      );
      current.push(value);
      smallest = Math.min(smallest, value);
    }
    if (smallest > limit) {
      return smallest;
    }
    previous = current;
  }
  return previous[right.length] ?? 0;
}

function commonPrefix(left: string, right: string): number {
  let length = 0;
  while (length < left.length && length < right.length && left[length] === right[length]) {
    length++;
  }
  return length;
}

function commonSuffix(left: string, right: string): number {
  let length = 0;
  while (
    length < left.length &&
    length < right.length &&
    left[left.length - length - 1] === right[right.length - length - 1]
  ) {
    length++;
  }
  return length;
}

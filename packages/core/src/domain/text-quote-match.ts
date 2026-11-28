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
const ignorable = /[\s\u00ad\u200b-\u200d\u2060\ufeff]+/gu;

interface Normalized {
  readonly text: string;
  /** For each normalized character, its offset in the original text. */
  readonly offsets: Uint32Array;
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

/** Like {@link matchTextQuote}, but refuses ambiguous and approximate matches. */
export function resolveSearchQuote(
  text: string,
  quote: TextQuote,
): { start: number; end: number } | null {
  const match = matchTextQuote(text, quote);
  return match && !match.ambiguous && !match.approximate ? match : null;
}

type QuoteRange = Pick<TextQuoteMatch, "start" | "end">;

/** Prepares the text once. Range-only callers accept the first equally good placement. */
export function textQuoteMatcher(text: string): (quote: TextQuote) => TextQuoteMatch | null;
export function textQuoteMatcher(
  text: string,
  mode: "range",
): (quote: TextQuote) => QuoteRange | null;
export function textQuoteMatcher(
  text: string,
  mode?: "range",
): (quote: TextQuote) => QuoteRange | null {
  const haystack = normalize(text);
  return (quote) => {
    const needle = quote.exact.replace(ignorable, "");
    if (!needle) {
      return null;
    }
    const prefix = (quote.prefix ?? "").replace(ignorable, "");
    const suffix = (quote.suffix ?? "").replace(ignorable, "");
    if (mode === "range") {
      // Painting needs the first best range. A full context match already has the
      // maximum possible score, even when a later occurrence ties.
      const found = haystack.text.indexOf(prefix + needle + suffix);
      if (found >= 0) {
        const start = found + prefix.length;
        return originalRange(haystack, start, start + needle.length);
      }
    }
    const best = bestMatch(haystack.text, needle, prefix, suffix);
    const range = best && originalRange(haystack, best.start, best.end);
    return (
      best &&
      range && {
        ...range,
        ambiguous: best.ambiguous,
        approximate: best.errors > 0,
      }
    );
  };
}

function originalRange(haystack: Normalized, start: number, end: number): QuoteRange | null {
  const first = haystack.offsets[start];
  const last = haystack.offsets[end - 1];
  return first === undefined || last === undefined ? null : { start: first, end: last + 1 };
}

function bestMatch(
  text: string,
  needle: string,
  prefix: string,
  suffix: string,
): (Candidate & { readonly ambiguous: boolean }) | null {
  const first = text.indexOf(needle);
  if (first === -1) {
    return choose(text, approximate(text, needle), prefix, suffix);
  }
  const second = text.indexOf(needle, first + 1);
  if (second === -1 || (!prefix && !suffix)) {
    return { start: first, end: first + needle.length, errors: 0, ambiguous: second !== -1 };
  }
  // A full context match has the highest possible score. Find it directly when a quote
  // repeats, which is common for headings, pull quotes, and highlights of short passages.
  if (prefix.length + suffix.length >= minimumContext) {
    const contextual = prefix + needle + suffix;
    const match = text.indexOf(contextual);
    if (match !== -1) {
      const start = match + prefix.length;
      return {
        start,
        end: start + needle.length,
        errors: 0,
        ambiguous: text.includes(contextual, match + 1),
      };
    }
  }
  function* candidates(): Iterable<Candidate> {
    yield { start: first, end: first + needle.length, errors: 0 };
    for (let start = second; start !== -1; start = text.indexOf(needle, start + 1)) {
      yield { start, end: start + needle.length, errors: 0 };
    }
  }
  return choose(text, candidates(), prefix, suffix);
}

function normalize(value: string): Normalized {
  const text = value.replace(ignorable, "");
  const offsets = new Uint32Array(text.length);
  // Both strings use UTF-16 offsets. Ignorable code units never occur in text.
  let raw = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    while (value.charCodeAt(raw) !== code) {
      raw++;
    }
    offsets[index] = raw++;
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
  candidates: Iterable<Candidate>,
  prefix: string,
  suffix: string,
): (Candidate & { readonly ambiguous: boolean }) | null {
  let best: Candidate | undefined;
  let bestContext = -1;
  let runnerUpContext = -1;
  for (const candidate of candidates) {
    if (best && candidate.errors > best.errors) {
      continue;
    }
    const context =
      commonSuffix(
        text.slice(Math.max(0, candidate.start - prefix.length), candidate.start),
        prefix,
      ) + commonPrefix(text.slice(candidate.end, candidate.end + suffix.length), suffix);
    if (!best || candidate.errors < best.errors) {
      best = candidate;
      bestContext = context;
      runnerUpContext = -1;
    } else if (context > bestContext) {
      best = candidate;
      runnerUpContext = bestContext;
      bestContext = context;
    } else {
      runnerUpContext = Math.max(runnerUpContext, context);
    }
  }
  return best
    ? {
        ...best,
        ambiguous:
          runnerUpContext >= 0 && (bestContext < minimumContext || runnerUpContext === bestContext),
      }
    : null;
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

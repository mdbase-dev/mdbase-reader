import { snippetExcerpt, withoutBlockMarkup } from "./snippet-text.js";

export interface SearchExcerpt {
  readonly before: string;
  readonly match: string;
  readonly after: string;
}

/** `markdown` hides block markers in a note's or annotation's snippet; matching is unchanged. */
export function searchExcerpt(
  text: string,
  query: string,
  {
    context = 90,
    markdown = false,
  }: { readonly context?: number; readonly markdown?: boolean } = {},
): SearchExcerpt | null {
  const needle = query.trim().replace(/\s+/gu, " ");
  if (!needle) {
    return null;
  }
  // Match the original text, preserving line breaks until display cleanup. Quotation
  // evidence is built separately from this same unmodified text by searchQuote.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/ /gu, "\\s+");
  const match = new RegExp(escaped, "iu").exec(text);
  if (!match) {
    return null;
  }
  const index = match.index;
  const matchEnd = index + match[0].length;
  const start = Math.max(0, index - context);
  const end = Math.min(text.length, matchEnd + context);
  const display = (part: string, lineStart: boolean): string =>
    markdown ? withoutBlockMarkup(part, lineStart) : part;
  return snippetExcerpt({
    before: `${start > 0 ? "…" : ""}${display(text.slice(start, index), start === 0 || text[start - 1] === "\n")}`,
    // The match is what the reader typed, so only markers after a line break inside it go.
    match: display(match[0], false),
    after: `${display(text.slice(matchEnd, end), false)}${end < text.length ? "…" : ""}`,
  });
}

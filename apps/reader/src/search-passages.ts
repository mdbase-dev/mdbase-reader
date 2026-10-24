import { snippetExcerpt } from "./snippet-text.js";

export interface SearchExcerpt {
  readonly before: string;
  readonly match: string;
  readonly after: string;
}

export function searchExcerpt(text: string, query: string, context = 90): SearchExcerpt | null {
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
  return snippetExcerpt({
    before: `${start > 0 ? "…" : ""}${text.slice(start, index)}`,
    match: match[0],
    after: `${text.slice(matchEnd, end)}${end < text.length ? "…" : ""}`,
  });
}

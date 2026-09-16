export interface SearchExcerpt {
  readonly before: string;
  readonly match: string;
  readonly after: string;
}

export function searchExcerpt(text: string, query: string, context = 90): SearchExcerpt | null {
  const clean = text.replace(/\s+/gu, " ");
  const needle = query.trim().replace(/\s+/gu, " ");
  if (!needle) {
    return null;
  }
  const index = clean.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index < 0) {
    return null;
  }
  const start = Math.max(0, index - context);
  const end = Math.min(clean.length, index + needle.length + context);
  return {
    before: `${start > 0 ? "…" : ""}${clean.slice(start, index)}`,
    match: clean.slice(index, index + needle.length),
    after: `${clean.slice(index + needle.length, end)}${end < clean.length ? "…" : ""}`,
  };
}

import type { SourceId, SourceSummary } from "@mdbase-reader/core";

/**
 * Who a source is by, for a one-line listing. A chapter without its own creators is by its
 * book's, when the book is at hand; otherwise it shows none rather than an unknown creator,
 * since its book says who it is by.
 */
export function sourceCreatorsText(
  source: SourceSummary,
  sources: ReadonlyMap<SourceId, SourceSummary>,
  unknown = "",
): string {
  const own = source.creators.join(", ");
  if (own || !source.partOf) {
    return own || unknown;
  }
  return sources.get(source.partOf)?.creators.join(", ") ?? "";
}

export function sourcesById(
  sources: readonly SourceSummary[],
): ReadonlyMap<SourceId, SourceSummary> {
  return new Map(sources.map((source) => [source.id, source]));
}

import type { SourceId, SourceSummary } from "@mdbase-reader/core";

export const libraryLensIds = [
  "all",
  "recent",
  "reading",
  "inbox",
  "annotated",
  "missing-citation",
  "pdf",
  "epub",
  "web",
] as const;
export type LibraryLensId = (typeof libraryLensIds)[number];

export interface LibraryLensContext {
  readonly recentSourceIds: readonly SourceId[];
  readonly annotatedSourceIds: ReadonlySet<SourceId>;
}

export function applyLibraryLens(
  sources: readonly SourceSummary[],
  lens: LibraryLensId,
  context: LibraryLensContext,
): readonly SourceSummary[] {
  if (lens === "recent") {
    const byId = new Map(sources.map((source) => [source.id, source]));
    return context.recentSourceIds.flatMap((id) => {
      const source = byId.get(id);
      return source ? [source] : [];
    });
  }
  return sources.filter((source) => sourceMatchesLens(source, lens, context));
}

export function sourceMatchesLens(
  source: SourceSummary,
  lens: LibraryLensId,
  context: LibraryLensContext,
): boolean {
  switch (lens) {
    case "all":
      return true;
    case "reading":
      return (source.readingStatus ?? "inbox") === "reading";
    case "inbox":
      return (source.readingStatus ?? "inbox") === "inbox";
    case "annotated":
      return context.annotatedSourceIds.has(source.id);
    case "missing-citation":
      return !source.citation || Boolean(source.citationProblems?.length);
    case "pdf":
      return source.documents.some(({ mediaType }) => mediaType.includes("pdf"));
    case "epub":
      return source.documents.some(({ mediaType }) => mediaType.includes("epub"));
    case "web":
      return source.documents.some(({ mediaType }) => mediaType.includes("html"));
    case "recent":
      return context.recentSourceIds.includes(source.id);
  }
}

export function libraryLensLabel(lens: LibraryLensId): string {
  const labels: Record<LibraryLensId, string> = {
    all: "All sources",
    recent: "Recently opened",
    reading: "Currently reading",
    inbox: "Unread inbox",
    annotated: "Has annotations",
    "missing-citation": "Missing citation data",
    pdf: "PDF",
    epub: "EPUB",
    web: "Saved web pages",
  };
  return labels[lens];
}

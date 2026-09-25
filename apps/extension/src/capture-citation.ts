import {
  citekeyForCitation,
  saveSourceCitation,
  type Source,
  type SourceSummary,
} from "@mdbase-reader/core";
import {
  citationForPage,
  extractScholarlyMetadata,
  type CitationDraft,
  type CitationPreview,
} from "@mdbase-reader/web-capture";

import type { PageCapture } from "./page-capture.js";
import type { ReaderConnectedCollection } from "@mdbase-reader/connect";

export type { CitationPreview } from "@mdbase-reader/web-capture";

/** Resolves the citation for the page or PDF in the tab; see {@link citationForPage}. */
export function prepareCitation(
  capture: PageCapture,
  signal?: AbortSignal,
): Promise<CitationPreview | null> {
  const embedded =
    capture.kind === "html"
      ? extractScholarlyMetadata(
          new DOMParser().parseFromString(capture.html, "text/html"),
          capture.canonicalUrl,
        )
      : {};
  return citationForPage(embedded, capture.canonicalUrl, signal ? { signal } : {});
}

/** Stores the citation on a newly created source under an unused citekey. */
export async function saveCaptureCitation(
  collection: ReaderConnectedCollection,
  source: Source,
  citation: CitationDraft,
): Promise<Source> {
  const base = citekeyForCitation(citation, []);
  const library = await sourcesWithCitekeyPrefix(collection, base);
  const id = citekeyForCitation(citation, library, source.id);
  return saveSourceCitation(collection.sources, source, library, { ...citation, id });
}

async function sourcesWithCitekeyPrefix(
  collection: ReaderConnectedCollection,
  prefix: string,
): Promise<readonly SourceSummary[]> {
  const { sources, collectionId } = collection;
  if (sources.findByCitekeyPrefix) {
    return sources.findByCitekeyPrefix(collectionId, prefix);
  }
  const found: SourceSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await sources.list({ collectionId, limit: 200, ...(cursor ? { cursor } : {}) });
    found.push(...page.items.filter((source) => source.citation?.id.startsWith(prefix)));
    cursor = page.nextCursor;
  } while (cursor);
  return found;
}

export function citationSummary(citation: CitationDraft): string {
  const authors = Array.isArray(citation["author"])
    ? (citation["author"] as { family?: string; literal?: string }[])
    : [];
  const first = authors[0]?.family ?? authors[0]?.literal;
  const people = first ? `${first}${authors.length > 1 ? " et al." : ""}` : null;
  const issued = citation["issued"] as { "date-parts"?: unknown[][] } | undefined;
  const year = issued?.["date-parts"]?.[0]?.[0];
  const container =
    typeof citation["container-title"] === "string" ? citation["container-title"] : null;
  return [
    people,
    typeof year === "number" || typeof year === "string" ? `(${String(year)})` : null,
    container,
  ]
    .filter(Boolean)
    .join(" · ");
}

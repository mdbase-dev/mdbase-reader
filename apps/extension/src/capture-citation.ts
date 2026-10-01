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
      ? extractScholarlyMetadata(parsedCaptureHtml(capture.html), capture.canonicalUrl)
      : {};
  return citationForPage(embedded, capture.canonicalUrl, signal ? { signal } : {});
}

let parsedPage: { readonly html: string; readonly document: Document } | null = null;

/**
 * The tab's HTML parsed once for both the citation lookup when the panel opens and the save.
 * Only the latest page is kept. Callers must not modify the document.
 */
export function parsedCaptureHtml(html: string): Document {
  if (parsedPage?.html !== html) {
    parsedPage = { html, document: new DOMParser().parseFromString(html, "text/html") };
  }
  return parsedPage.document;
}

/**
 * Sources whose citekeys could collide with the citation's. Independent of the source being
 * created, so it can be fetched while that source is still importing.
 */
export function citekeyNeighbours(
  collection: ReaderConnectedCollection,
  citation: CitationDraft,
): Promise<readonly SourceSummary[]> {
  return sourcesWithCitekeyPrefix(collection, citekeyForCitation(citation, []));
}

/** Stores the citation on a newly created source under an unused citekey. */
export async function saveCaptureCitation(
  collection: ReaderConnectedCollection,
  source: Source,
  citation: CitationDraft,
  neighbours: Promise<readonly SourceSummary[]> = citekeyNeighbours(collection, citation),
): Promise<Source> {
  const library = await neighbours;
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

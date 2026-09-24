import {
  citekeyForCitation,
  saveSourceCitation,
  type Source,
  type SourceSummary,
} from "@mdbase-reader/core";
import {
  arxivIdentifier,
  doiFromUrl,
  extractScholarlyMetadata,
  mergedCitation,
  resolveDoiCitation,
  type CitationDraft,
} from "@mdbase-reader/web-capture";

import type { PageCapture } from "./page-capture.js";
import type { ReaderConnectedCollection } from "@mdbase-reader/connect";

export interface CitationPreview {
  readonly citation: CitationDraft;
  /** `doi`: the registration agency's record; `page`: tags the publisher embedded. */
  readonly origin: "doi" | "page";
  readonly doi?: string;
  readonly pdfUrl?: string;
  /** Why the DOI record was not used, when resolution failed. */
  readonly problem?: string;
}

/**
 * Prefers the DOI registry's CSL (clean names, containers, ISSNs) and falls back to the
 * page's embedded tags, which also fill fields the registry lacks.
 */
export async function prepareCitation(
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
  const arxiv = arxivIdentifier(capture.canonicalUrl);
  const doi =
    embedded.doi ??
    doiFromUrl(capture.canonicalUrl) ??
    (arxiv ? `10.48550/arXiv.${arxiv.replace(/v\d+$/u, "")}` : undefined);
  const pdfUrl = embedded.pdfUrl;
  const base = { ...(doi ? { doi } : {}), ...(pdfUrl ? { pdfUrl } : {}) };
  if (doi) {
    try {
      const resolved = await resolveDoiCitation(doi, signal ? { signal } : {});
      return { ...base, citation: mergedCitation(resolved, embedded.citation), origin: "doi" };
    } catch (reason) {
      signal?.throwIfAborted();
      const problem = reason instanceof Error ? reason.message : String(reason);
      return embedded.citation
        ? { ...base, citation: embedded.citation, origin: "page", problem }
        : null;
    }
  }
  return embedded.citation ? { ...base, citation: embedded.citation, origin: "page" } : null;
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

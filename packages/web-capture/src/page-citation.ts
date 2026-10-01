import { mergedCitation, type CitationDraft } from "./csl-values.js";
import {
  arxivIdentifier,
  doiFromUrl,
  resolveDoiCitation,
  type DoiResolutionOptions,
} from "./doi.js";

import type { ScholarlyMetadata } from "./scholarly-metadata.js";

/** A save may be waiting on this lookup; past it, the page's embedded tags are used instead. */
export const PAGE_DOI_TIMEOUT_MS = 3_000;

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
 * Prefers the DOI registry's CSL (clean names, containers, ISSNs) and falls back to the page's
 * embedded tags, which also fill fields the registry lacks. `embedded` is empty for a PDF.
 */
export async function citationForPage(
  embedded: ScholarlyMetadata,
  pageUrl: string,
  options: DoiResolutionOptions = {},
): Promise<CitationPreview | null> {
  const arxiv = arxivIdentifier(pageUrl);
  const doi =
    embedded.doi ??
    doiFromUrl(pageUrl) ??
    (arxiv ? `10.48550/arXiv.${arxiv.replace(/v\d+$/u, "")}` : undefined);
  const pdfUrl = embedded.pdfUrl;
  const base = { ...(doi ? { doi } : {}), ...(pdfUrl ? { pdfUrl } : {}) };
  if (doi) {
    try {
      const resolved = await resolveDoiCitation(doi, {
        timeoutMs: PAGE_DOI_TIMEOUT_MS,
        ...options,
      });
      return { ...base, citation: mergedCitation(resolved, embedded.citation), origin: "doi" };
    } catch (reason) {
      options.signal?.throwIfAborted();
      const problem = reason instanceof Error ? reason.message : String(reason);
      return embedded.citation
        ? { ...base, citation: embedded.citation, origin: "page", problem }
        : null;
    }
  }
  return embedded.citation ? { ...base, citation: embedded.citation, origin: "page" } : null;
}

import { pageClaims } from "./page-claims.js";
import { resolveCitation } from "./resolver.js";

import type { ClaimBatch } from "./claims.js";
import type { CitationDraft } from "./csl-values.js";

/** Bibliographic evidence embedded in a captured page, resolved by the shared claims core. */
export interface ScholarlyMetadata {
  readonly doi?: string;
  readonly pdfUrl?: string;
  /** Present whenever the page supplies title-level evidence, including ordinary web pages. */
  readonly citation?: CitationDraft;
}

/** Compatibility boundary for capture callers; no independent field-precedence rules. */
export function extractScholarlyMetadata(document: Document, pageUrl: string): ScholarlyMetadata {
  // All evidence comes from the same snapshot, so its observation time cannot break a tie.
  return scholarlyMetadataFromClaims(pageClaims(document, pageUrl, ""));
}

/** Resolve the already-extracted snapshot once; capture keeps this same batch as evidence. */
export function scholarlyMetadataFromClaims(batch: ClaimBatch): ScholarlyMetadata {
  const { citation } = resolveCitation({ claims: batch.claims });
  return {
    ...(batch.identifiers?.doi ? { doi: batch.identifiers.doi } : {}),
    ...(batch.pdfUrl ? { pdfUrl: batch.pdfUrl } : {}),
    ...(citation ? { citation } : {}),
  };
}

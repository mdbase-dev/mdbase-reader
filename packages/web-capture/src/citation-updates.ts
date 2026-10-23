import { doiFromText, doiFromUrl } from "./doi.js";
import { citoidClaims, doiClaims } from "./provider-claims.js";

import type { Claim } from "./claims.js";
import type { CitoidClaimsOptions } from "./provider-claims.js";

export { claimSourceLabel, parseClaimSourceLabel } from "./claims.js";
export { resolveCitation } from "./resolver.js";
export type { Claim, CitationSuggestion } from "./claims.js";

export interface CitationUpdateRequest {
  readonly query: string;
  readonly url?: string;
  readonly doi?: string;
}

/** User-initiated only: sends a URL and identifiers, never the citation or collection. */
export async function lookUpCitationClaims(
  request: CitationUpdateRequest,
  options: CitoidClaimsOptions = {},
): Promise<readonly Claim[]> {
  const query = request.query.trim();
  const url = /^https?:\/\//iu.test(query) ? query : request.url;
  const page = url ? await citoidClaims(url, options) : undefined;
  const identifiers = new Set(
    [
      doiFromText(query) ?? doiFromUrl(query),
      request.doi,
      page?.identifiers?.doi,
      ...(page?.claims ?? []).flatMap((claim) =>
        claim.field === "DOI" && typeof claim.value === "string" ? [claim.value] : [],
      ),
    ].filter((doi): doi is string => Boolean(doi)),
  );
  // Bounded enrichment: a page and at most two distinct DOI records per explicit lookup.
  const registries = await Promise.all(
    [...identifiers].slice(0, 2).map((doi) => doiClaims(doi, options)),
  );
  return [...(page?.claims ?? []), ...registries.flatMap((batch) => batch.claims)];
}

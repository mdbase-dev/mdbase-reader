import { doiFromText, doiFromUrl } from "./doi.js";
import { citoidClaims, doiClaims } from "./provider-claims.js";

import type { Claim } from "./claims.js";
import type { CitoidClaimsOptions } from "./provider-claims.js";

export { claimValuesMatch } from "./claim-matching.js";
export { claimSourceLabel, parseClaimSourceLabel } from "./claims.js";
export { resolveCitation } from "./resolver.js";
export type { Claim, CitationSuggestion } from "./claims.js";

export interface CitationUpdateRequest {
  /** An explicit lookup target; empty or "refresh" uses the current URL and DOI. */
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
  const refresh = query === "" || query.toLowerCase() === "refresh";
  const url = /^https?:\/\//iu.test(query) ? query : refresh ? request.url : undefined;
  const page = url ? await citoidClaims(url, options) : undefined;
  const queryDoi = doiFromText(query) ?? doiFromUrl(query);
  const identifiers = new Set(
    (queryDoi
      ? [queryDoi]
      : [
          ...(refresh ? [request.doi] : []),
          page?.identifiers?.doi,
          ...(page?.claims ?? []).flatMap((claim) =>
            claim.field === "DOI" && typeof claim.value === "string" ? [claim.value] : [],
          ),
        ]
    ).filter((doi): doi is string => Boolean(doi)),
  );
  // Bounded enrichment: a page and at most two distinct DOI records per explicit lookup.
  const registries = await Promise.all(
    [...identifiers].slice(0, 2).map((doi) => doiClaims(doi, options)),
  );
  return [...(page?.claims ?? []), ...registries.flatMap((batch) => batch.claims)];
}

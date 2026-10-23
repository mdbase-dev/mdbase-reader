import { doiFromText, doiFromUrl } from "./doi.js";
import { remoteCitationClaims } from "./remote-citation.js";

import type { Claim } from "./claims.js";
import type { CitoidClaimsOptions } from "./provider-claims.js";

export { claimValuesMatch } from "./claim-matching.js";
export { claimSourceLabel, parseClaimSourceLabel } from "./claims.js";
export { resolveCitation } from "./resolver.js";
export { parentCitationClaims, type ParentCitationClaimsOptions } from "./parent-claims.js";
export { pageClaims } from "./page-claims.js";
export type { Claim, CitationSuggestion } from "./claims.js";

export interface CitationUpdateRequest {
  /** An explicit lookup target; empty or "refresh" uses the current URL and DOI. */
  readonly query: string;
  readonly url?: string;
  readonly doi?: string;
}

export interface CitationUpdateOptions extends CitoidClaimsOptions {
  readonly deadlineMs?: number;
}

/** User-initiated only: sends a URL and identifiers, never the citation or collection. */
export async function lookUpCitationClaims(
  request: CitationUpdateRequest,
  options: CitationUpdateOptions = {},
): Promise<readonly Claim[]> {
  const query = request.query.trim();
  const refresh = query === "" || query.toLowerCase() === "refresh";
  const isUrl = /^https?:\/\//iu.test(query);
  const url = isUrl ? query : refresh ? request.url : undefined;
  // URL search/hash are not part of the DOI; never run free-text extraction on a URL.
  const doi = isUrl
    ? doiFromUrl(query)
    : refresh
      ? (doiFromText(request.doi) ?? (url ? doiFromUrl(url) : undefined))
      : doiFromText(query);
  const claims: Claim[] = [];
  await remoteCitationClaims(url, doi, { ...options, citoid: options }, (batch) => {
    claims.push(...batch.claims);
  });
  return claims;
}

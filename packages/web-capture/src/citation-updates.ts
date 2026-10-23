import { doiFromText, doiFromUrl } from "./doi.js";
import { remoteCitationClaims } from "./remote-citation.js";

import type { Claim, ProviderOutcome } from "./claims.js";
import type { CitoidClaimsOptions } from "./provider-claims.js";

export { claimValuesMatch } from "./claim-matching.js";
export { claimSourceLabel, parseClaimSourceLabel } from "./claims.js";
export { resolveCitation } from "./resolver.js";
export {
  parentCitationClaims,
  isParentCitationField,
  type ParentCitationClaimsOptions,
} from "./parent-claims.js";
export { pageClaims } from "./page-claims.js";
export type { Claim, CitationSuggestion } from "./claims.js";

export interface CitationUpdateRequest {
  /** An explicit lookup target; empty or "refresh" uses the current URL and DOI. */
  readonly query: string;
  readonly url?: string;
  readonly doi?: string;
  /** Optional local comparison context for refresh only; never sent to a provider. */
  readonly citation?: Readonly<Record<string, unknown>>;
}

export interface CitationUpdateOptions extends CitoidClaimsOptions {
  readonly deadlineMs?: number;
  readonly onOutcome?: (outcome: ProviderOutcome) => void;
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
  const work = {
    citation: refresh ? (request.citation ?? {}) : {},
    ...(doi ? { identifiers: { doi } } : {}),
    ...(url ? { url } : {}),
  };
  await remoteCitationClaims(url, doi, { ...options, citoid: options, work }, (batch) => {
    claims.push(...batch.claims);
    if (batch.outcome) {
      options.onOutcome?.(batch.outcome);
    }
  });
  return claims;
}

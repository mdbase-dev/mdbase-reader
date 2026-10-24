import { cslValuesEqual, type CitationCandidate, type CslProvenance } from "@mdbase-reader/core";
import {
  claimSourceLabel,
  resolveCitation,
  type Claim,
} from "@mdbase-reader/web-capture/citation-updates";

import type { DocumentFileDetails } from "./document-details.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";

/** Candidate-only providers still identify their evidence; never give Citoid registry rank. */
export function candidateClaims(candidate: CitationCandidate): readonly Claim[] {
  const provider = candidate.provenance.provider;
  const source: Claim["source"] =
    provider === "doi.org" || provider === "DOI registry (doi.org)"
      ? { kind: "registry", name: "doi.org" }
      : provider === "isbn" || provider === "pubmed"
        ? { kind: "registry", name: provider }
        : { kind: "generic-remote", name: provider };
  return Object.entries(candidate.citation)
    .filter(([field]) => field !== "id")
    .map(([field, value]) => ({
      field,
      value,
      source,
      observedAt: candidate.provenance.retrievedAt,
    }));
}

/** Local file evidence is weaker than a registry, and never a user decision. */
export function documentClaims(details: DocumentFileDetails, observedAt: string): readonly Claim[] {
  const doi =
    details.identifiers.doi ??
    (details.identifiers.arxiv
      ? `10.48550/arXiv.${details.identifiers.arxiv.replace(/v\d+$/u, "")}`
      : undefined);
  const fields = {
    ...(details.title ? { title: details.title } : {}),
    ...(details.metadata.authors?.length
      ? { author: details.metadata.authors.map((literal) => ({ literal })) }
      : {}),
    ...(doi ? { DOI: doi } : {}),
    ...(details.identifiers.isbn ? { ISBN: details.identifiers.isbn } : {}),
  };
  return Object.entries(fields).map(([field, value]) => ({
    field,
    value,
    source: { kind: "page", signal: "dublin-core" },
    evidence: "embedded document metadata",
    observedAt,
  }));
}

/** Explain the accepted candidate without changing its values or its collection-local citekey. */
export function candidateProvenance(
  candidate: CitationCandidate,
  claims: readonly Claim[] = candidateClaims(candidate),
  embedded: readonly Claim[] = [],
): CslProvenance {
  const resolved = resolveCitation({ claims: [...embedded, ...claims] });
  return Object.fromEntries(
    claims.flatMap((claim) => {
      if (claim.field === "id" || !cslValuesEqual(candidate.citation[claim.field], claim.value)) {
        return [];
      }
      const explanation = resolved.provenance[claim.field];
      // The add flow accepts the candidate as a whole. Resolver normalization must not silently
      // edit it, nor pin an explanation for a different value to the saved field.
      return [
        [
          claim.field,
          explanation && cslValuesEqual(explanation.value, claim.value)
            ? explanation
            : { value: claim.value, source: claimSourceLabel(claim.source) },
        ],
      ];
    }),
  );
}

export async function newCitationProvenance(
  candidate: CitationCandidate,
  gateway?: ReaderWorkspaceGateway,
  signal?: AbortSignal,
  embedded: readonly Claim[] = [],
): Promise<CslProvenance> {
  signal?.throwIfAborted();
  const query = candidate.provenance.query;
  const supported = /^https?:\/\//iu.test(query) || /^(?:doi:\s*)?10\.\d{4,9}\//iu.test(query);
  if (!gateway?.citationClaims || !supported) {
    return candidateProvenance(candidate, undefined, embedded);
  }
  // Keep the gateway's whole-work identity checks and uncertain-source downgrades. Missing
  // or rejected field evidence must not regain registry strength through the candidate summary.
  const remote = await gateway.citationClaims({ query }, signal ? { signal } : {}).catch(() => []);
  signal?.throwIfAborted();
  const claims = candidateClaims(candidate).map(
    (claim): Claim =>
      remote.find(
        (item) => item.field === claim.field && cslValuesEqual(item.value, claim.value),
      ) ?? {
        ...claim,
        source: { kind: "generic-remote", name: candidate.provenance.provider },
      },
  );
  return candidateProvenance(candidate, claims, embedded);
}

import { cslValuesEqual } from "@mdbase-reader/core";

import { arxivIdentifier, doiFromText, doiFromUrl } from "./doi.js";
import { arxivDoi } from "./metadata-identifiers.js";
import { remoteCitationClaims } from "./remote-citation.js";
import { resolveCitation } from "./resolver.js";

import type { ClaimBatch, ProviderOutcome } from "./claims.js";
import type { CitationDraft } from "./csl-values.js";
import type { CitoidClaimsOptions, ProviderClaimsOptions } from "./provider-claims.js";
import type { CslProvenance } from "@mdbase-reader/core";

export { PAGE_DOI_TIMEOUT_MS, PAGE_CITATION_DEADLINE_MS } from "./remote-citation.js";

export interface CitationPreview {
  readonly citation: CitationDraft;
  readonly provenance: CslProvenance;
  readonly outcomes: ProviderOutcome[];
  /** The strongest provider that contributed to the resolved citation. */
  readonly origin: "doi" | "page" | "citoid";
  readonly doi?: string;
  readonly pdfUrl?: string;
  /** Why a remote record could not be obtained; page evidence remains usable. */
  readonly problem?: string;
}

export interface PageCitationOptions extends ProviderClaimsOptions {
  /** Off unless the host has permission to send the page address to this service. */
  readonly citoid?: false | CitoidClaimsOptions;
  /** Overall remote lookup budget, including queueing and identifier discoveries. */
  readonly deadlineMs?: number;
  /** Page evidence is delivered synchronously, before any remote lookup starts. */
  readonly onUpdate?: (preview: CitationPreview) => void;
}

/** Resolves immediately from the snapshot, then upgrades it as remote evidence arrives. */
export async function citationForPage(
  page: ClaimBatch | null,
  pageUrl: string,
  options: PageCitationOptions = {},
): Promise<CitationPreview | null> {
  options.signal?.throwIfAborted();
  const claims = [...(page?.claims ?? [])];
  const observedAt = snapshotObservedAt(page, options);
  const outcomes: ProviderOutcome[] = page?.outcome ? [page.outcome] : [];
  let doi = batchDoi(page) ?? doiFromUrl(pageUrl) ?? arxivDoi(arxivIdentifier(pageUrl));
  let problem: string | undefined;
  let lastUpdate: CitationPreview | null = null;

  function preview(): CitationPreview | null {
    const { citation, provenance } = resolveCitation({ claims });
    if (!citation) {
      return null;
    }
    const sources = Object.values(provenance).flatMap((entry) => [
      entry.source,
      ...(entry.agreed ?? []),
    ]);
    const origin = sources.some((source) => source.startsWith("registry:"))
      ? "doi"
      : sources.some((source) =>
            /^(?:site-adapter:citoid\/|generic-remote:citoid(?: |$))/u.test(source),
          )
        ? "citoid"
        : "page";
    return {
      citation,
      provenance,
      outcomes: [...outcomes],
      origin,
      ...(doi ? { doi } : {}),
      ...(page?.pdfUrl ? { pdfUrl: page.pdfUrl } : {}),
      ...(problem ? { problem } : {}),
    };
  }

  function publish(): void {
    options.signal?.throwIfAborted();
    const next = preview();
    if (
      next &&
      (!lastUpdate ||
        !cslValuesEqual(next.citation, lastUpdate.citation) ||
        !cslValuesEqual(next.provenance, lastUpdate.provenance))
    ) {
      lastUpdate = next;
      options.onUpdate?.(next);
    }
  }

  function accept(batch: ClaimBatch, timeoutMs: number): void {
    claims.push(...batch.claims);
    if (batch.outcome) {
      outcomes.push(batch.outcome);
      if (
        batch.outcome.provider === "doi.org" &&
        batch.outcome.result !== "ok" &&
        batch.outcome.result !== "cancelled"
      ) {
        problem ??= providerProblem(batch.outcome, timeoutMs);
      }
    }
    publish();
  }

  publish();
  await remoteCitationClaims(
    pageUrl,
    doi,
    { ...options, observedAt },
    (batch, timeoutMs, identifier) => {
      doi = identifier;
      if (batch.outcome?.provider === "doi.org" && batch.outcome.result === "ok") {
        problem = undefined;
      }
      accept(batch, timeoutMs);
    },
  );
  return preview();
}

function snapshotObservedAt(page: ClaimBatch | null, options: PageCitationOptions): string {
  // A later fetch of potentially cached metadata is not evidence of newer content.
  const latest = page?.claims
    .filter(
      (claim) => claim.source.kind === "page" && Number.isFinite(Date.parse(claim.observedAt)),
    )
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0]?.observedAt;
  return (
    page?.observedAt ??
    latest ??
    options.observedAt ??
    (options.now?.() ?? new Date()).toISOString()
  );
}

function batchDoi(batch: ClaimBatch | null): string | undefined {
  const claimed = batch?.claims.find((claim) => claim.field === "DOI")?.value;
  return (
    doiFromText(batch?.identifiers?.doi) ??
    doiFromText(typeof claimed === "string" ? claimed : undefined) ??
    arxivDoi(batch?.identifiers?.arxiv)
  );
}

function providerProblem(outcome: ProviderOutcome, doiTimeoutMs: number): string {
  switch (outcome.result) {
    case "timeout":
      return `The DOI registry did not answer within ${String(doiTimeoutMs / 1_000)} seconds.`;
    case "not-found":
      return "The DOI registry did not find a citation for this DOI.";
    case "rate-limited":
      return "The DOI registry is receiving too many requests. Try again later.";
    case "blocked":
      return "The DOI registry blocked this lookup.";
    default:
      return "The DOI registry lookup failed.";
  }
}

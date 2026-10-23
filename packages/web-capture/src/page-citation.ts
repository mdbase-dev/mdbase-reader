import { cslValuesEqual } from "@mdbase-reader/core";

import { arxivIdentifier, doiFromText, doiFromUrl } from "./doi.js";
import { arxivDoi } from "./metadata-identifiers.js";
import { citoidClaims, doiClaims } from "./provider-claims.js";
import { resolveCitation } from "./resolver.js";

import type { ClaimBatch, ProviderOutcome } from "./claims.js";
import type { CitationDraft } from "./csl-values.js";
import type { CitoidClaimsOptions, ProviderClaimsOptions } from "./provider-claims.js";
import type { CslProvenance } from "@mdbase-reader/core";

/** A save may be waiting on this lookup; past it, the page's embedded tags are used instead. */
export const PAGE_DOI_TIMEOUT_MS = 3_000;

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

  function accept(batch: ClaimBatch): void {
    claims.push(...batch.claims);
    if (batch.outcome) {
      outcomes.push(batch.outcome);
      if (batch.outcome.result !== "ok") {
        problem ??= providerProblem(batch.outcome, options.timeoutMs ?? PAGE_DOI_TIMEOUT_MS);
      }
    }
    publish();
  }

  const attempted = new Set<string>();
  async function registryLookup(identifier: string): Promise<boolean> {
    attempted.add(identifier.toLowerCase());
    const batch = await doiClaims(identifier, {
      ...options,
      timeoutMs: options.timeoutMs ?? PAGE_DOI_TIMEOUT_MS,
    });
    accept(batch);
    return (
      batch.outcome?.result === "ok" &&
      batch.claims.some((claim) => claim.source.kind === "registry")
    );
  }

  publish();
  const registered = doi ? await registryLookup(doi) : false;
  // A known DOI gets the short first chance, avoiding a redundant URL disclosure on success.
  if (!registered && options.citoid) {
    const batch = await citoidClaims(pageUrl, {
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.now ? { now: options.now } : {}),
      ...options.citoid,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    doi ??= batchDoi(batch);
    accept(batch);
    if (doi && !attempted.has(doi.toLowerCase())) {
      await registryLookup(doi);
    }
  }
  options.signal?.throwIfAborted();
  return preview();
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
  const provider = outcome.provider === "doi.org" ? "DOI registry" : "citation service";
  if (outcome.result === "timeout") {
    return outcome.provider === "doi.org"
      ? `The DOI registry did not answer within ${String(doiTimeoutMs / 1_000)} seconds.`
      : "The citation service did not answer in time.";
  }
  return `The ${provider} lookup ${outcome.result.replaceAll("-", " ")}.`;
}

import { cslValuesEqual } from "@mdbase-reader/core";

import { arxivIdentifier, doiFromText, doiFromUrl } from "./doi.js";
import { arxivDoi } from "./metadata-identifiers.js";
import { CITOID_TIMEOUT_MS, citoidClaims, doiClaims } from "./provider-claims.js";
import { resolveCitation } from "./resolver.js";

import type { ClaimBatch, ProviderOutcome } from "./claims.js";
import type { CitationDraft } from "./csl-values.js";
import type { CitoidClaimsOptions, ProviderClaimsOptions } from "./provider-claims.js";
import type { CslProvenance } from "@mdbase-reader/core";

/** A save may be waiting on this lookup; past it, the page's embedded tags are used instead. */
export const PAGE_DOI_TIMEOUT_MS = 3_000;
export const PAGE_CITATION_DEADLINE_MS = 8_000;

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
  const now = options.now ?? (() => new Date());
  const deadline = now().getTime() + (options.deadlineMs ?? PAGE_CITATION_DEADLINE_MS);
  const remaining = (): number => Math.max(0, deadline - now().getTime());
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
    const sources = Object.values(provenance).flatMap((entry) =>
      entry.source === undefined ? [] : [entry.source, ...(entry.agreed ?? [])],
    );
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

  const attempted = new Set<string>();
  async function registryLookup(identifier: string): Promise<boolean> {
    const timeoutMs = Math.min(options.timeoutMs ?? PAGE_DOI_TIMEOUT_MS, remaining());
    if (timeoutMs <= 0) {
      return false;
    }
    attempted.add(identifier.toLowerCase());
    const batch = await doiClaims(identifier, { ...options, observedAt, timeoutMs });
    const registered =
      batch.outcome?.result === "ok" &&
      batch.claims.some((claim) => claim.source.kind === "registry");
    if (registered) {
      problem = undefined;
    }
    accept(batch, timeoutMs);
    return registered;
  }

  async function citoidLookup(citoid: CitoidClaimsOptions): Promise<void> {
    const timeoutMs = Math.min(citoid.timeoutMs ?? CITOID_TIMEOUT_MS, remaining());
    if (timeoutMs <= 0) {
      return;
    }
    const batch = await citoidClaims(pageUrl, {
      ...options,
      observedAt,
      ...citoid,
      timeoutMs,
      ...combinedSignal(options.signal, citoid.signal),
    });
    const discoveredDoi = batchDoi(batch);
    doi ??= discoveredDoi;
    accept(batch, timeoutMs);
    if (discoveredDoi && !attempted.has(discoveredDoi.toLowerCase())) {
      doi = discoveredDoi;
      await registryLookup(doi);
    }
  }

  publish();
  const registered = doi ? await registryLookup(doi) : false;
  // A known DOI goes to its registry first; only failures disclose the page URL to Citoid.
  if (!registered && options.citoid) {
    await citoidLookup(options.citoid);
  }
  options.signal?.throwIfAborted();
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

function combinedSignal(...signals: (AbortSignal | undefined)[]): { signal?: AbortSignal } {
  const present = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  return present.length ? { signal: AbortSignal.any(present) } : {};
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

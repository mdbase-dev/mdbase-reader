import { cslValuesEqual } from "@mdbase-reader/core";

import { WIKIMEDIA_CITOID_ENDPOINT } from "./citation-lookup.js";
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
  // Providers describe this capture unless they supply an independently dated snapshot.
  // Fetching a potentially cached record later does not make its content newer.
  const observedAt =
    claims
      .filter(
        (claim) => claim.source.kind === "page" && Number.isFinite(Date.parse(claim.observedAt)),
      )
      .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0]?.observedAt ??
    options.observedAt ??
    (options.now?.() ?? new Date()).toISOString();
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
      if (batch.outcome.result !== "ok" && batch.outcome.result !== "cancelled") {
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
      observedAt,
      timeoutMs: options.timeoutMs ?? PAGE_DOI_TIMEOUT_MS,
    });
    const registered =
      batch.outcome?.result === "ok" &&
      batch.claims.some((claim) => claim.source.kind === "registry");
    if (registered) {
      problem = undefined;
    }
    accept(batch);
    return registered;
  }

  publish();
  const citoidController = new AbortController();
  let registered = false;
  const registry = doi
    ? registryLookup(doi).then((obtained) => {
        registered = obtained;
        if (obtained) {
          citoidController.abort();
        }
        return obtained;
      })
    : Promise.resolve(false);
  // Opted-in URL lookups can upgrade a slow DOI lookup, but never hold a registry result up.
  const remote = options.citoid
    ? lookupCitoid(
        pageUrl,
        options,
        { observedAt, ...options.citoid },
        citoidController.signal,
      ).then((batch) => {
        if (registered) {
          if (batch.outcome) {
            outcomes.push(batch.outcome);
          }
          return;
        }
        const discoveredDoi = batchDoi(batch);
        doi ??= discoveredDoi;
        accept(batch);
        return discoveredDoi;
      })
    : Promise.resolve(undefined);
  const [obtained, discoveredDoi] = await Promise.all([registry, remote]);
  if (!obtained && discoveredDoi && !attempted.has(discoveredDoi.toLowerCase())) {
    doi = discoveredDoi;
    await registryLookup(doi);
  }
  options.signal?.throwIfAborted();
  return preview();
}

async function lookupCitoid(
  pageUrl: string,
  options: PageCitationOptions,
  citoid: CitoidClaimsOptions,
  stop: AbortSignal,
): Promise<ClaimBatch> {
  const now = options.now ?? (() => new Date());
  const startedAt = now().getTime();
  try {
    return await citoidClaims(pageUrl, {
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.now ? { now: options.now } : {}),
      ...(options.setTimeout ? { setTimeout: options.setTimeout } : {}),
      ...(options.clearTimeout ? { clearTimeout: options.clearTimeout } : {}),
      ...citoid,
      signal: AbortSignal.any([
        stop,
        ...(options.signal ? [options.signal] : []),
        ...(citoid.signal ? [citoid.signal] : []),
      ]),
    });
  } catch (reason) {
    options.signal?.throwIfAborted();
    citoid.signal?.throwIfAborted();
    if (!stop.aborted) {
      throw reason;
    }
    return {
      claims: [],
      outcome: {
        provider:
          citoid.citoidEndpoint && citoid.citoidEndpoint !== WIKIMEDIA_CITOID_ENDPOINT
            ? "translation-server"
            : "citoid",
        result: "cancelled",
        elapsedMs: Math.max(0, now().getTime() - startedAt),
      },
    };
  }
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

import { doiFromText } from "./doi.js";
import { citoidClaims, doiClaims } from "./provider-claims.js";
import { workDoi } from "./remote-work-identity.js";

import type { ClaimBatch } from "./claims.js";
import type { CitoidClaimsOptions, ProviderClaimsOptions } from "./provider-claims.js";
import type { RemoteWorkIdentity } from "./remote-work-identity.js";

export const PAGE_DOI_TIMEOUT_MS = 3_000;
export const PAGE_CITATION_DEADLINE_MS = 8_000;

export interface RemoteCitationOptions extends ProviderClaimsOptions {
  readonly deadlineMs?: number;
  readonly citoid?: false | CitoidClaimsOptions;
}

/** Registry first, then optional URL disclosure, all sharing one deadline and DOI budget. */
export async function remoteCitationClaims(
  url: string | undefined,
  initialDoi: string | undefined,
  options: RemoteCitationOptions,
  accept: (batch: ClaimBatch, timeoutMs: number, doi: string | undefined) => void,
): Promise<void> {
  options.signal?.throwIfAborted();
  const now = (): number => (options.now?.() ?? new Date()).getTime();
  const deadline = now() + (options.deadlineMs ?? PAGE_CITATION_DEADLINE_MS);
  const remaining = (): number => Math.max(0, deadline - now());
  let doiBudget = Math.min(options.timeoutMs ?? PAGE_DOI_TIMEOUT_MS, PAGE_DOI_TIMEOUT_MS);
  const attempted = new Set<string>();
  const work = lookupWork(options, url, initialDoi);
  let registryWork = work;
  let doi = initialLookupDoi(work, initialDoi);

  async function registry(identifier: string): Promise<boolean> {
    const timeoutMs = Math.min(doiBudget, remaining());
    if (timeoutMs <= 0 || attempted.has(identifier.toLowerCase())) {
      return false;
    }
    attempted.add(identifier.toLowerCase());
    const start = now();
    const batch = await doiClaims(identifier, { ...options, timeoutMs, work: registryWork });
    doiBudget = Math.max(0, doiBudget - (now() - start));
    accept(batch, timeoutMs, doi);
    return batch.outcome?.result === "ok" && batch.claims.length > 0;
  }

  const registered = doi ? await registry(doi) : false;
  if (!registered && url && options.citoid && remaining() > 0) {
    const citoid = options.citoid;
    const timeoutMs = Math.min(citoid.timeoutMs ?? PAGE_CITATION_DEADLINE_MS, remaining());
    const signals = [options.signal, citoid.signal].filter(
      (signal): signal is AbortSignal => signal !== undefined,
    );
    const batch = await citoidClaims(url, {
      ...options,
      ...citoid,
      timeoutMs,
      work,
      ...(signals.length ? { signal: AbortSignal.any(signals) } : {}),
    });
    const discovered = batchDoi(batch);
    doi ??= discovered;
    accept(batch, timeoutMs, doi);
    if (discovered && !attempted.has(discovered.toLowerCase())) {
      registryWork = confirmedRegistryWork(work, batch, discovered);
      doi = discovered;
      await registry(discovered);
    }
  }
  options.signal?.throwIfAborted();
}

function lookupWork(
  options: RemoteCitationOptions,
  url: string | undefined,
  doi: string | undefined,
): RemoteWorkIdentity {
  return (
    options.work ?? {
      citation: doi ? { DOI: doi } : {},
      ...(url ? { url } : {}),
    }
  );
}

function initialLookupDoi(work: RemoteWorkIdentity, doi: string | undefined): string | undefined {
  return workDoi(work) ?? doi;
}

function confirmedRegistryWork(
  work: RemoteWorkIdentity,
  batch: ClaimBatch,
  doi: string,
): RemoteWorkIdentity {
  // Only a confirmed same-work record may establish a new registry identity.
  // Uncertain discoveries are still compared with the page, not self-confirmed.
  return batch.outcome?.result === "ok"
    ? { ...work, identifiers: { ...work.identifiers, doi } }
    : work;
}

function batchDoi(batch: ClaimBatch): string | undefined {
  const claimed = batch.claims.find((claim) => claim.field === "DOI")?.value;
  return (
    doiFromText(batch.identifiers?.doi) ??
    doiFromText(typeof claimed === "string" ? claimed : undefined)
  );
}

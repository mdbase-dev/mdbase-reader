import { WIKIMEDIA_CITOID_ENDPOINT } from "./citation-lookup.js";
import { citoidUrl } from "./citoid-url.js";
import { doiFromText, DOI_RESOLUTION_TIMEOUT_MS, resolveDoiCitation } from "./doi.js";
import { isStackExchangeQuestion } from "./page-conventions.js";
import {
  createProviderQueue,
  MAX_RETRY_AFTER_MS,
  ProviderCooldownError,
  retryAfterMs,
} from "./provider-queue.js";
import { checkRemoteWork } from "./remote-work-identity.js";
import { cslFromZoteroItem } from "./zotero-csl.js";

import type {
  Claim,
  ClaimBatch,
  ClaimIdentifiers,
  ClaimSource,
  ProviderName,
  ProviderOutcome,
  ProviderResult,
} from "./claims.js";
import type { CitationDraft } from "./csl-values.js";
import type { ProviderQueue } from "./provider-queue.js";
import type { RemoteWorkIdentity } from "./remote-work-identity.js";

export interface ProviderClaimsOptions {
  /** Local comparison only: never disclosed to the provider. */
  readonly work?: RemoteWorkIdentity;
  readonly fetch?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly queue?: ProviderQueue;
  /** Known media type of the target, if already captured. PDFs are never disclosed. */
  readonly contentType?: string;
  readonly now?: () => Date;
  /** When the described content was observed, not when the lookup finished. */
  readonly observedAt?: string;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
}

export interface CitoidClaimsOptions extends ProviderClaimsOptions {
  /** Same path shape as Citoid; a private Translation Server can replace the endpoint. */
  readonly citoidEndpoint?: string;
  readonly clientName?: string;
}

export const CITOID_TIMEOUT_MS = 8_000;

const defaultQueue = createProviderQueue();

// Zotero's Embedded Metadata translator emits these types, without a site-specific translator.
const genericItemTypes = new Set([
  "webpage",
  "newspaperArticle",
  "blogPost",
  "magazineArticle",
  "forumPost",
]);

/**
 * Whether a Citoid claim's evidence (`Citoid webpage`) names a type that only the generic
 * Embedded Metadata translator produces: the claim restates the page's own tags.
 */
export function isEmbeddedMetadataEvidence(evidence: string | undefined): boolean {
  const match = /^Citoid (\S+)$/u.exec(evidence ?? "");
  return match?.[1] !== undefined && genericItemTypes.has(match[1]);
}

/** Caller aborts are rethrown, just as in citationForPage; provider failures become outcomes. */
export function doiClaims(doi: string, options: ProviderClaimsOptions = {}): Promise<ClaimBatch> {
  const timeoutMs = options.timeoutMs ?? DOI_RESOLUTION_TIMEOUT_MS;
  return collectClaims("doi.org", options, timeoutMs, async (signal, fetcher) => {
    const queue = options.queue ?? defaultQueue;
    const queuedFetch: typeof fetch = (input, init) =>
      queue.run(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        () => untilAborted(() => fetcher(input, init), signal),
        signal,
        timeoutMs,
      );
    const citation = await resolveDoiCitation(doi, { fetch: queuedFetch, signal, timeoutMs });
    return {
      claims: fieldClaims(
        citation,
        { kind: "registry", name: "doi.org" },
        "doi.org CSL",
        observedAt(options),
      ),
      identifiers: citationIdentifiers(citation),
    };
  });
}

/** One claim per converted CSL field, including whole creator lists rather than individual names. */
export function zoteroItemClaims(
  item: Readonly<Record<string, unknown>>,
  observedAt: string,
): Claim[] {
  const itemType = text(item["itemType"]) ?? "webpage";
  const source: ClaimSource = genericItemTypes.has(itemType)
    ? { kind: "generic-remote", name: "citoid" }
    : { kind: "site-adapter", name: `citoid/${itemType}` };
  const citation = cslFromZoteroItem(item);
  const claims = fieldClaims(citation, source, `Citoid ${itemType}`, observedAt);
  // Only refine a successful generic record. A blocked page still supplies no title,
  // author or date; the permalink identifies the kind of work, not its unseen content.
  if (
    itemType === "webpage" &&
    text(citation["title"]) &&
    isStackExchangeQuestion(citation["URL"])
  ) {
    claims.push({
      field: "type",
      value: "post",
      source: { kind: "site-adapter", name: "stack-exchange/question" },
      evidence: "question permalink",
      observedAt,
    });
  }
  return claims;
}

/** The deadline includes time spent queued. Caller aborts are rethrown, not reported as failures. */
export function citoidClaims(url: string, options: CitoidClaimsOptions = {}): Promise<ClaimBatch> {
  const endpoint = options.citoidEndpoint ?? WIKIMEDIA_CITOID_ENDPOINT;
  const provider = endpoint === WIKIMEDIA_CITOID_ENDPOINT ? "citoid" : "translation-server";
  return collectClaims(
    provider,
    options,
    options.timeoutMs ?? CITOID_TIMEOUT_MS,
    async (signal, fetcher) => {
      const safeUrl = citoidUrl(url, options.contentType);
      if (!safeUrl) {
        return { claims: [], result: "blocked" };
      }
      const requestUrl = `${endpoint}${encodeURIComponent(safeUrl)}`;
      const queue = options.queue ?? defaultQueue;
      const response = await queue.run(
        requestUrl,
        () =>
          untilAborted(
            () =>
              fetcher(requestUrl, {
                headers: {
                  Accept: "application/json",
                  "Api-User-Agent": options.clientName ?? "mdbase-reader",
                },
                credentials: "omit",
                signal,
              }),
            signal,
          ),
        signal,
        options.timeoutMs ?? CITOID_TIMEOUT_MS,
      );
      if (!response.ok) {
        return { claims: [], result: httpResult(response.status) };
      }
      const value: unknown = await response.json();
      if (!Array.isArray(value)) {
        throw new Error("The citation service returned no item array.");
      }
      const first: unknown = value[0];
      if (first === undefined) {
        return { claims: [], result: "not-found" };
      }
      if (typeof first !== "object" || first === null || Array.isArray(first)) {
        throw new Error("The citation service returned an invalid item.");
      }
      const claims = zoteroItemClaims(
        first as Readonly<Record<string, unknown>>,
        observedAt(options),
      );
      const citation = Object.fromEntries(claims.map(({ field, value }) => [field, value]));
      return { claims, identifiers: citationIdentifiers(citation) };
    },
  );
}

type ProviderReply = Omit<ClaimBatch, "outcome"> & {
  readonly result?: ProviderResult;
  readonly retryAfterMs?: number;
};
type ProviderWork = (signal: AbortSignal, fetcher: typeof fetch) => Promise<ProviderReply>;

async function collectClaims(
  provider: ProviderName,
  options: ProviderClaimsOptions,
  timeoutMs: number,
  work: ProviderWork,
): Promise<ClaimBatch> {
  options.signal?.throwIfAborted();
  const now = options.now ?? (() => new Date());
  const startedAt = now().getTime();
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  const schedule = options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
  const cancel = options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
  const timer = schedule(
    () => controller.abort(new DOMException("Provider timed out", "TimeoutError")),
    timeoutMs,
  );
  let response: Response | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    response = await (options.fetch ?? globalThis.fetch.bind(globalThis))(input, init);
    return response;
  };
  function outcome(result: ProviderResult, known?: number): ProviderOutcome {
    const delay =
      result === "rate-limited"
        ? boundedRetryAfter(
            known ?? retryAfterMs(response?.headers.get("Retry-After") ?? null, now().getTime()),
          )
        : undefined;
    return {
      provider,
      result,
      elapsedMs: Math.max(0, now().getTime() - startedAt),
      ...(delay !== undefined ? { retryAfterMs: delay } : {}),
    };
  }
  try {
    const {
      result = "ok",
      retryAfterMs: known,
      ...batch
    } = await untilAborted(() => work(signal, fetcher), signal);
    options.signal?.throwIfAborted();
    const collected = { ...batch, outcome: outcome(result, known) };
    return options.work ? checkRemoteWork(collected, options.work) : collected;
  } catch (reason) {
    options.signal?.throwIfAborted();
    if (reason instanceof ProviderCooldownError) {
      return { claims: [], outcome: outcome("rate-limited", reason.retryAfterMs) };
    }
    const result = controller.signal.aborted
      ? "timeout"
      : response && !response.ok
        ? httpResult(response.status)
        : "failed";
    return { claims: [], outcome: outcome(result) };
  } finally {
    cancel(timer);
  }
}

function boundedRetryAfter(delay: number | undefined): number | undefined {
  return delay === undefined ? undefined : Math.min(delay, MAX_RETRY_AFTER_MS);
}

function httpResult(status: number): ProviderResult {
  switch (status) {
    case 400:
    case 404:
      return "not-found";
    case 429:
      return "rate-limited";
    case 403:
    case 451:
      return "blocked";
    default:
      return "failed";
  }
}

function fieldClaims(
  citation: CitationDraft,
  source: ClaimSource,
  evidence: string,
  observedAt: string,
): Claim[] {
  return Object.entries(citation).map(([field, value]) => ({
    field,
    value,
    source,
    evidence,
    observedAt,
  }));
}

function citationIdentifiers(citation: Readonly<Record<string, unknown>>): ClaimIdentifiers {
  const doi = doiFromText(text(citation["DOI"]));
  const isbn = text(citation["ISBN"]);
  return { ...(doi ? { doi } : {}), ...(isbn ? { isbn } : {}) };
}

function observedAt(options: ProviderClaimsOptions): string {
  return options.observedAt ?? (options.now?.() ?? new Date()).toISOString();
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function untilAborted<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = (): void => reject(signal.reason as Error);
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    void Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return work();
      })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

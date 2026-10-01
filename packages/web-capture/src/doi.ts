import { sanitizedCitation, type CitationDraft } from "./csl-values.js";

const doiPattern = /\b(10\.\d{4,9}\/[^\s"'<>]+)/u;

/** Finds a bare DOI in an identifier, a `doi:` prefix or a doi.org URL. */
export function doiFromText(value: string | undefined): string | undefined {
  const match = doiPattern.exec(safeDecode(value ?? ""));
  // Trailing sentence punctuation is almost never part of a registered DOI.
  return match?.[1]?.replace(/[.,;:)\]}]+$/u, "");
}

/** doi.org links and publisher paths such as /doi/10.1234/x or /doi/abs/10.1234/x. */
export function doiFromUrl(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (/(^|\.)doi\.org$/u.test(url.hostname)) {
    return doiFromText(url.pathname);
  }
  const path = /\/doi\/(?:abs\/|full\/|pdf\/|epdf\/|book\/)?(10\.\d{4,9}\/.+)$/u.exec(url.pathname);
  return path ? doiFromText(path[1]) : undefined;
}

/** arXiv abstract and PDF URLs carry their identifier; arXiv registers DOIs for every paper. */
export function arxivIdentifier(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!/(^|\.)arxiv\.org$/u.test(url.hostname)) {
      return undefined;
    }
    return /^\/(?:abs|pdf|html)\/([^/]+?)(?:\.pdf)?$/u.exec(url.pathname)?.[1];
  } catch {
    return undefined;
  }
}

export interface DoiResolutionOptions {
  readonly fetch?: typeof fetch;
  readonly signal?: AbortSignal;
  /** Gives up on doi.org after this long; defaults to {@link DOI_RESOLUTION_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
}

/** Long enough for a busy registry; an explicit lookup the reader is waiting on. */
export const DOI_RESOLUTION_TIMEOUT_MS = 10_000;

/**
 * Asks the DOI registration agency (Crossref, DataCite, mEDRA…) for CSL-JSON through doi.org
 * content negotiation. doi.org and the agencies send CORS headers, so no host permission is
 * needed. Only the DOI is sent.
 */
export async function resolveDoiCitation(
  doi: string,
  options: DoiResolutionOptions = {},
): Promise<CitationDraft> {
  const timeoutMs = options.timeoutMs ?? DOI_RESOLUTION_TIMEOUT_MS;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    return await requestDoiCitation(doi, options.fetch, signal);
  } catch (reason) {
    options.signal?.throwIfAborted();
    if (timeout.aborted) {
      throw new Error(
        `The DOI registry did not answer for ${doi} within ${String(timeoutMs / 1_000)} seconds.`,
        { cause: reason },
      );
    }
    throw reason;
  }
}

async function requestDoiCitation(
  doi: string,
  fetchOverride: typeof fetch | undefined,
  signal: AbortSignal,
): Promise<CitationDraft> {
  const fetcher = fetchOverride ?? globalThis.fetch.bind(globalThis);
  // A fetch that ignores its signal still cannot hold the caller past the deadline.
  const response = await untilAborted(
    fetcher(`https://doi.org/${doi.split("/").map(encodeURIComponent).join("/")}`, {
      headers: { Accept: "application/vnd.citationstyles.csl+json" },
      credentials: "omit",
      signal,
    }),
    signal,
  );
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? `The DOI ${doi} is not registered.`
        : `The DOI registry returned HTTP ${String(response.status)} for ${doi}.`,
    );
  }
  const value: unknown = await untilAborted(response.json(), signal);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`The DOI registry returned no citation for ${doi}.`);
  }
  const record = value as Record<string, unknown>;
  const type = typeof record["type"] === "string" ? crossrefTypes[record["type"]] : undefined;
  const citation = sanitizedCitation(type ? { ...record, type } : record);
  return { ...citation, DOI: doi };
}

/** doi.org passes some Crossref records through with Crossref's type names, not CSL's. */
const crossrefTypes: Readonly<Record<string, string>> = {
  "journal-article": "article-journal",
  "proceedings-article": "paper-conference",
  "book-chapter": "chapter",
  "book-section": "chapter",
  "book-part": "chapter",
  monograph: "book",
  "edited-book": "book",
  "reference-book": "book",
  dissertation: "thesis",
  "posted-content": "article",
  "reference-entry": "entry",
  "peer-review": "review",
};

function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(signal.reason as Error);
    signal.addEventListener("abort", abort, { once: true });
    void work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

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
}

/**
 * Asks the DOI registration agency (Crossref, DataCite, mEDRA…) for CSL-JSON through doi.org
 * content negotiation. doi.org and the agencies send CORS headers, so no host permission is
 * needed. Only the DOI is sent.
 */
export async function resolveDoiCitation(
  doi: string,
  options: DoiResolutionOptions = {},
): Promise<CitationDraft> {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const response = await fetcher(
    `https://doi.org/${doi.split("/").map(encodeURIComponent).join("/")}`,
    {
      headers: { Accept: "application/vnd.citationstyles.csl+json" },
      credentials: "omit",
      ...(options.signal ? { signal: options.signal } : {}),
    },
  );
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? `The DOI ${doi} is not registered.`
        : `The DOI registry returned HTTP ${String(response.status)} for ${doi}.`,
    );
  }
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`The DOI registry returned no citation for ${doi}.`);
  }
  const citation = sanitizedCitation(value as Record<string, unknown>);
  return { ...citation, DOI: doi };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

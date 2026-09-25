import {
  cslProblemSummary,
  validateCslItem,
  type CitationCandidate,
  type CitationResolutionRequest,
  type CslItem,
} from "@mdbase-reader/core";

import { arxivIdentifier, doiFromText, doiFromUrl, resolveDoiCitation } from "./doi.js";
import { cslFromZoteroItem } from "./zotero-csl.js";

import type { CitationDraft } from "./csl-values.js";

/**
 * Wikimedia's Citoid runs Zotero's translation-server (site translators, ISBN catalogues,
 * PubMed, Crossref title search) and answers browsers with CORS. A self-hosted
 * translation-server fronted by the same path shape can replace it.
 */
export const WIKIMEDIA_CITOID_ENDPOINT =
  "https://en.wikipedia.org/api/rest_v1/data/citation/zotero/";

export interface CitationLookupOptions {
  readonly fetch?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly citoidEndpoint?: string;
  /** Wikimedia asks API clients to identify themselves; browsers cannot set User-Agent. */
  readonly clientName?: string;
  readonly now?: () => Date;
}

/**
 * DOIs (including DOI and arXiv URLs) go to the DOI registry, whose CSL is authoritative. ISBNs,
 * PubMed identifiers, other URLs and titles go to Citoid. Only the query is sent.
 */
export async function lookUpCitation(
  request: CitationResolutionRequest,
  options: CitationLookupOptions = {},
): Promise<CitationCandidate> {
  const query = request.value.trim();
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  const doi = requestDoi(request.kind, query);
  if (doi) {
    const citation = await resolveDoiCitation(doi, {
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    return candidate(citation, { provider: "DOI registry (doi.org)", query, retrievedAt }, []);
  }
  const items = await citoidItems(citoidQuery(request.kind, query), request.kind, options);
  const [first] = items;
  if (!first) {
    throw new Error(`No citation details were found for ${query}.`);
  }
  const warnings =
    request.kind === "text" && items.length > 1
      ? [
          `This is the closest of ${String(items.length)} matches for a title search. Check it is the same work before applying it.`,
        ]
      : [];
  return candidate(
    preferQueriedIsbn(cslFromZoteroItem(first), query),
    {
      provider: options.citoidEndpoint
        ? "Zotero translation server"
        : "Citoid (Zotero translators via Wikimedia)",
      query,
      retrievedAt,
    },
    warnings,
  );
}

function requestDoi(kind: CitationResolutionRequest["kind"], query: string): string | undefined {
  if (kind === "url") {
    const arxiv = arxivIdentifier(query);
    return doiFromUrl(query) ?? (arxiv ? arxivDoi(arxiv) : undefined);
  }
  if (kind === "identifier") {
    const arxiv = /^arxiv:\s*(\S+)$/iu.exec(query)?.[1];
    return arxiv ? arxivDoi(arxiv) : doiFromText(query);
  }
  return undefined;
}

function arxivDoi(identifier: string): string {
  return `10.48550/arXiv.${identifier.replace(/v\d+$/u, "")}`;
}

/** Citoid recognises bare ISBNs, PMIDs and PMCIDs, not `isbn:` style prefixes. */
function citoidQuery(kind: CitationResolutionRequest["kind"], query: string): string {
  if (kind !== "identifier") {
    return query;
  }
  const prefixed = /^(isbn|pmid|pmcid):?\s*(\S.*)$/iu.exec(query);
  if (!prefixed?.[1] || !prefixed[2]) {
    return query;
  }
  const value = prefixed[2].trim();
  if (prefixed[1].toLowerCase() === "pmcid") {
    return /^pmc/iu.test(value) ? value.toUpperCase() : `PMC${value}`;
  }
  return value;
}

async function citoidItems(
  query: string,
  kind: CitationResolutionRequest["kind"],
  options: CitationLookupOptions,
): Promise<Readonly<Record<string, unknown>>[]> {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const response = await fetcher(
    `${options.citoidEndpoint ?? WIKIMEDIA_CITOID_ENDPOINT}${encodeURIComponent(query)}`,
    {
      headers: {
        Accept: "application/json",
        "Api-User-Agent": options.clientName ?? "mdbase-reader",
      },
      credentials: "omit",
      ...(options.signal ? { signal: options.signal } : {}),
    },
  );
  if (!response.ok) {
    if (response.status === 404 || response.status === 400) {
      throw new Error(
        kind === "url"
          ? `No citation details were found for ${query}. The site may block automated requests; paste its DOI or ISBN if it has one.`
          : `No citation details were found for ${query}.`,
      );
    }
    throw new Error(`The citation service returned HTTP ${String(response.status)}.`);
  }
  const value: unknown = await response.json();
  return Array.isArray(value)
    ? value.filter(
        (item): item is Readonly<Record<string, unknown>> =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

/** Catalogues list every edition's ISBN in one field; keep the one that was asked for. */
function preferQueriedIsbn(citation: CitationDraft, query: string): CitationDraft {
  const isbns = typeof citation["ISBN"] === "string" ? citation["ISBN"].split(/[\s,;]+/u) : [];
  if (isbns.length < 2) {
    return citation;
  }
  const digits = (value: string): string => value.replace(/[^\dx]/giu, "").toUpperCase();
  const wanted = digits(query);
  return { ...citation, ISBN: isbns.find((isbn) => digits(isbn) === wanted) ?? isbns[0] };
}

function candidate(
  citation: CitationDraft,
  provenance: CitationCandidate["provenance"],
  warnings: readonly string[],
): CitationCandidate {
  const validation = validateCslItem({ ...citation, id: "candidate" });
  if (!validation.valid) {
    throw new Error(
      `The citation service returned an invalid record: ${cslProblemSummary(validation.problems)}`,
    );
  }
  const item: CslItem = validation.item;
  return { citation: item, provenance, warnings };
}

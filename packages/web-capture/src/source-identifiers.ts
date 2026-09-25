import { arxivIdentifier, doiFromText, doiFromUrl } from "./doi.js";

import type { CitationResolutionRequest } from "@mdbase-reader/core";

export type SourceIdentifier =
  | { readonly kind: "url"; readonly value: string }
  | { readonly kind: "doi"; readonly value: string }
  | { readonly kind: "arxiv"; readonly value: string }
  | { readonly kind: "isbn"; readonly value: string }
  | { readonly kind: "pmid"; readonly value: string }
  | { readonly kind: "pmcid"; readonly value: string };

const newArxiv = /^(\d{4}\.\d{4,5})(v\d+)?$/u;

/**
 * What someone pasted to add a source: a web address, or an identifier for a work. DOI and
 * arXiv links count as identifiers, because their landing pages are rarely what should be read.
 * Returns null for text that is none of these, such as a title.
 */
export function parseSourceInput(input: string): SourceIdentifier | null {
  const value = input.trim();
  if (/^https?:\/\//iu.test(value)) {
    return parseLink(value);
  }
  const prefixed = /^(doi|arxiv|isbn|pmid|pmcid)\s*:?\s*(\S.*)$/iu.exec(value);
  const scheme = prefixed?.[1]?.toLowerCase();
  const rest = prefixed?.[2]?.trim() ?? value;
  const parser = scheme ? identifierParsers[scheme] : undefined;
  if (parser) {
    return parser(rest);
  }
  return (
    unprefixed
      .map(([pattern, kind]) => (pattern.test(value) ? identifierParsers[kind]?.(value) : null))
      .find(Boolean) ?? null
  );
}

function parseLink(value: string): SourceIdentifier {
  const arxiv = arxivIdentifier(value);
  if (arxiv) {
    return { kind: "arxiv", value: arxiv };
  }
  const doi = doiFromUrl(value);
  return doi && /(^|\.)doi\.org$/iu.test(new URL(value).hostname)
    ? { kind: "doi", value: doi }
    : { kind: "url", value };
}

const identifierParsers: Readonly<Record<string, (value: string) => SourceIdentifier | null>> = {
  doi: (value) => {
    const doi = doiFromText(value);
    return doi ? { kind: "doi", value: doi } : null;
  },
  arxiv: (value) =>
    /^[\w.-]+(?:\/\d{7})?(?:v\d+)?$/u.test(value) ? { kind: "arxiv", value } : null,
  pmid: (value) => (/^\d{1,9}$/u.test(value) ? { kind: "pmid", value } : null),
  pmcid: (value) => {
    const digits = /^(?:pmc)?(\d+)$/iu.exec(value)?.[1];
    return digits ? { kind: "pmcid", value: `PMC${digits}` } : null;
  },
  isbn: (value) => {
    const isbn = normalizedIsbn(value);
    return isbn ? { kind: "isbn", value: isbn } : null;
  },
};

/** Identifiers recognisable without a prefix. Bare numbers are ISBNs, never PubMed IDs. */
const unprefixed: readonly (readonly [RegExp, string])[] = [
  [/^10\.\d{4,9}\//u, "doi"],
  [newArxiv, "arxiv"],
  [/^pmc\d+$/iu, "pmcid"],
  [/^[\dXx\s-]+$/u, "isbn"],
];

/** The citation lookup request for an identifier. */
export function identifierLookup(identifier: SourceIdentifier): CitationResolutionRequest {
  if (identifier.kind === "url") {
    return { kind: "url", value: identifier.value };
  }
  const prefix = identifier.kind === "doi" ? "" : `${identifier.kind}:`;
  return { kind: "identifier", value: `${prefix}${identifier.value}` };
}

export interface IdentifiersInText {
  readonly doi?: string;
  readonly arxiv?: string;
  readonly isbn?: string;
}

/**
 * Identifiers printed in a document's opening pages or metadata. The first DOI wins; arXiv's
 * margin stamp ("arXiv:1706.03762v7 [cs.CL]") identifies preprints that have no DOI printed.
 */
export function identifiersInText(text: string): IdentifiersInText {
  const doi = doiFromText(text.replace(/\s+(?=\/)|(?<=\/)\s+/gu, ""));
  const arxiv = /\barXiv:\s*(\d{4}\.\d{4,5})(?:v\d+)?/iu.exec(text)?.[1];
  const isbn = [...text.matchAll(/\bISBN(?:-1[03])?:?\s*([\dXx][\d\s-]{8,16}[\dXx])/gu)]
    .map((match) => normalizedIsbn(match[1] ?? ""))
    .find(Boolean);
  return {
    ...(doi ? { doi } : {}),
    ...(arxiv ? { arxiv } : {}),
    ...(isbn ? { isbn } : {}),
  };
}

/** A valid ISBN-10 or ISBN-13 without separators, or undefined. */
export function normalizedIsbn(value: string): string | undefined {
  const compact = value.replace(/[\s-]/gu, "").toUpperCase();
  if (/^\d{9}[\dX]$/u.test(compact)) {
    const sum = Array.from(compact).reduce(
      (total, digit, index) => total + (digit === "X" ? 10 : Number(digit)) * (10 - index),
      0,
    );
    return sum % 11 === 0 ? compact : undefined;
  }
  if (/^97[89]\d{10}$/u.test(compact)) {
    const sum = Array.from(compact).reduce(
      (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
      0,
    );
    return sum % 10 === 0 ? compact : undefined;
  }
  return undefined;
}

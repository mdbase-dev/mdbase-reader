import { normalizedIsbn } from "@mdbase-reader/web-capture/source-identifiers";

import type { CitationCandidate, SourceSummary } from "@mdbase-reader/core";
import type { Claim } from "@mdbase-reader/web-capture/citation-updates";

/** Normalize ISBN-10 and ISBN-13 to the same edition identity, never title matching. */
export function chapterIsbns(value: unknown): readonly string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;]+|\s+(?=97[89])/u)
      : [];
  return values.flatMap((item): string[] => {
    const isbn = typeof item === "string" ? normalizedIsbn(item) : undefined;
    if (!isbn) {
      return [];
    }
    if (isbn.length === 13) {
      return [isbn];
    }
    const stem = `978${isbn.slice(0, 9)}`;
    const sum = Array.from(stem).reduce(
      (total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1),
      0,
    );
    return [`${stem}${String((10 - (sum % 10)) % 10)}`];
  });
}

export function chapterBooks(
  candidate: CitationCandidate,
  sources: readonly SourceSummary[],
): readonly SourceSummary[] {
  const isbns = new Set(chapterIsbns(candidate.citation["ISBN"]));
  return sources.filter(
    (source) =>
      source.citation?.type === "book" &&
      chapterIsbns(source.citation["ISBN"]).some((isbn) => isbns.has(isbn)),
  );
}

export function chapterCandidateClaims(candidate: CitationCandidate): readonly Claim[] {
  return Object.entries(candidate.citation)
    .filter(([field]) => field !== "id")
    .map(([field, value]) => ({
      field,
      value,
      source:
        candidate.provenance.provider === "doi.org"
          ? { kind: "registry", name: "doi.org" }
          : { kind: "generic-remote", name: candidate.provenance.provider },
      observedAt: candidate.provenance.retrievedAt,
    }));
}

export interface ChapterDoiOffer {
  readonly key: string;
  readonly candidate: CitationCandidate;
  readonly books: readonly SourceSummary[];
}

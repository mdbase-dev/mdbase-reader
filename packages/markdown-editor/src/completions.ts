export interface WikiLinkCandidate {
  readonly label: string;
  readonly path: string;
  readonly kind?: string;
  readonly detail?: string;
  readonly quote?: string;
  readonly note?: string;
  readonly embed?: boolean;
}

export interface WikiLinkCompletion {
  readonly from: number;
  readonly query: string;
  readonly options: readonly WikiLinkCandidate[];
}

export interface CitationCompletionCandidate {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly display?: string;
}

export interface CitationCompletion {
  readonly from: number;
  readonly query: string;
  readonly options: readonly CitationCompletionCandidate[];
}

export function wikiLinkCompletionAt(
  document: string,
  cursor: number,
  candidates: readonly WikiLinkCandidate[],
): WikiLinkCompletion | null {
  const before = document.slice(0, cursor);
  const opening = before.lastIndexOf("[[");
  if (opening < 0 || before.slice(opening + 2).includes("]]")) {
    return null;
  }

  const query = before
    .slice(opening + 2)
    .toLocaleLowerCase()
    .trim();
  const options = rankWikiLinks(candidates, query);
  return { from: opening + 2, query, options };
}

export function citationCompletionAt(
  document: string,
  cursor: number,
  candidates: readonly CitationCompletionCandidate[],
): CitationCompletion | null {
  const before = document.slice(0, cursor);
  const match = /(?:^|[\s(;,])@([^\s@\]]*)$/u.exec(before);
  if (!match) {
    return null;
  }
  const rawQuery = match[1] ?? "";
  const query = rawQuery.toLocaleLowerCase();
  const from = cursor - rawQuery.length - 1;
  const options = candidates
    .filter(({ id, label, detail }) =>
      [id, label, detail].some((value) => value?.toLocaleLowerCase().includes(query)),
    )
    .toSorted((left, right) => citationScore(right, query) - citationScore(left, query));
  return { from, query, options };
}

function rankWikiLinks(
  candidates: readonly WikiLinkCandidate[],
  query: string,
): readonly WikiLinkCandidate[] {
  const terms = query.split(/\s+/u).filter(Boolean);
  return candidates
    .filter((candidate) => {
      const text = candidateText(candidate);
      return terms.every((term) => text.includes(term));
    })
    .toSorted((left, right) => wikiScore(right, terms) - wikiScore(left, terms));
}

function candidateText(candidate: WikiLinkCandidate): string {
  return [
    candidate.label,
    candidate.path,
    candidate.kind,
    candidate.detail,
    candidate.quote,
    candidate.note,
  ]
    .filter((value): value is string => value !== undefined)
    .join("\n")
    .toLocaleLowerCase();
}

function wikiScore(candidate: WikiLinkCandidate, terms: readonly string[]): number {
  const label = candidate.label.toLocaleLowerCase();
  const path = candidate.path.toLocaleLowerCase();
  return terms.reduce(
    (score, term) =>
      score +
      (label.startsWith(term) ? 80 : label.includes(term) ? 40 : 0) +
      (path.startsWith(term) ? 20 : path.includes(term) ? 10 : 0),
    candidate.embed ? 4 : 0,
  );
}

function citationScore(candidate: CitationCompletionCandidate, query: string): number {
  const id = candidate.id.toLocaleLowerCase();
  const label = candidate.label.toLocaleLowerCase();
  return (id.startsWith(query) ? 60 : 0) + (label.startsWith(query) ? 40 : 0);
}

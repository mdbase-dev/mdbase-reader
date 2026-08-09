export interface WikiLinkCandidate {
  readonly label: string;
  readonly path: string;
}

export interface WikiLinkCompletion {
  readonly from: number;
  readonly query: string;
  readonly options: readonly WikiLinkCandidate[];
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

  const query = before.slice(opening + 2).toLocaleLowerCase();
  const options = candidates.filter(({ label, path }) =>
    `${label}\n${path}`.toLocaleLowerCase().includes(query),
  );
  return { from: opening + 2, query, options };
}

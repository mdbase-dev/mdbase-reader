import type { CslItem, CslValidationProblem } from "../domain/citation.js";
import type { SourceId } from "../domain/identity.js";
import type { SourceSummary } from "../domain/source.js";

export type BibliographyProblemKind = "missing" | "invalid" | "duplicate";

export interface BibliographyProblem {
  readonly sourceId: SourceId;
  readonly title: string;
  readonly kind: BibliographyProblemKind;
  readonly message: string;
}

export interface CslBibliography {
  readonly items: readonly CslItem[];
  readonly problems: readonly BibliographyProblem[];
}

export function buildCslBibliography(sources: readonly SourceSummary[]): CslBibliography {
  const candidates = sources.filter(hasCitation);
  const duplicateIds = duplicateCitekeys(candidates);
  const items = candidates
    .filter(({ citation }) => !duplicateIds.has(citation.id))
    .map(({ citation }) => citation);
  const problems = sources.flatMap((source) => sourceProblems(source, duplicateIds));
  return { items, problems };
}

export function serializeCslBibliography(items: readonly CslItem[]): string {
  return `${JSON.stringify(items, null, 2)}\n`;
}

function hasCitation(
  source: SourceSummary,
): source is SourceSummary & { readonly citation: CslItem } {
  return source.citation !== undefined;
}

function duplicateCitekeys(
  sources: readonly (SourceSummary & { readonly citation: CslItem })[],
): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const { citation } of sources) {
    counts.set(citation.id, (counts.get(citation.id) ?? 0) + 1);
  }
  return new Set(
    [...counts.entries()].filter(([, count]) => count > 1).map(([citekey]) => citekey),
  );
}

function sourceProblems(
  source: SourceSummary,
  duplicateIds: ReadonlySet<string>,
): readonly BibliographyProblem[] {
  if (source.citation && duplicateIds.has(source.citation.id)) {
    return [problem(source, "duplicate", `The citekey @${source.citation.id} is not unique.`)];
  }
  if (source.citationProblems?.length) {
    return [problem(source, "invalid", citationProblemMessage(source.citationProblems))];
  }
  if (!source.citation) {
    return [problem(source, "missing", "No CSL citation metadata is attached.")];
  }
  return [];
}

function problem(
  source: SourceSummary,
  kind: BibliographyProblemKind,
  message: string,
): BibliographyProblem {
  return { sourceId: source.id, title: source.title, kind, message };
}

function citationProblemMessage(problems: readonly CslValidationProblem[]): string {
  return problems.map(({ path, message }) => `${path} ${message}`).join("; ");
}

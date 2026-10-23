import { cslFieldStatuses, parseCslProvenance } from "./csl-provenance.js";

export const citationSourceKinds = [
  "registry",
  "site-adapter",
  "page",
  "generic-remote",
  "user",
  "unknown",
  "unexplained",
] as const;
export type CitationSourceKind = (typeof citationSourceKinds)[number];
type Counts = Record<CitationSourceKind, number>;

export interface CitationQualitySummary {
  readonly sources: number;
  readonly fieldsBySource: Readonly<Counts>;
  readonly editedBySource: Readonly<Counts>;
  readonly removedBySource: Readonly<Counts>;
  readonly removedFields: number;
}

/** Tier 0: fixed category counts only. No identifiers, field names, values or provider names survive. */
export function summariseCitationQuality(
  sources: readonly { readonly csl?: unknown; readonly cslProvenance?: unknown }[],
): CitationQualitySummary {
  const fieldsBySource = emptyCounts();
  const editedBySource = emptyCounts();
  const removedBySource = emptyCounts();
  let removedFields = 0;
  for (const source of sources) {
    const citation =
      typeof source.csl === "object" && source.csl !== null && !Array.isArray(source.csl)
        ? (source.csl as Readonly<Record<string, unknown>>)
        : {};
    for (const status of Object.values(
      cslFieldStatuses(citation, parseCslProvenance(source.cslProvenance)),
    )) {
      if (status.kind === "unexplained") {
        fieldsBySource.unexplained += 1;
      } else if (status.kind === "removed") {
        removedBySource[sourceKind(status.previous.source)] += 1;
        removedFields += 1;
      } else if (status.kind === "edited") {
        fieldsBySource.user += 1;
        editedBySource[sourceKind(status.previous.source)] += 1;
      } else {
        fieldsBySource[sourceKind(status.provenance.source)] += 1;
      }
    }
  }
  return {
    sources: sources.length,
    fieldsBySource,
    editedBySource,
    removedBySource,
    removedFields,
  };
}

function sourceKind(label: string): CitationSourceKind {
  const kind = label.split(":")[0];
  return (
    citationSourceKinds.find((candidate) => candidate !== "unexplained" && candidate === kind) ??
    "unknown"
  );
}

function emptyCounts(): Counts {
  return {
    registry: 0,
    "site-adapter": 0,
    page: 0,
    "generic-remote": 0,
    user: 0,
    unknown: 0,
    unexplained: 0,
  };
}

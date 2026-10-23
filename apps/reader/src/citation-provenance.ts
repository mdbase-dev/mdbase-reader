import {
  cslValuesEqual,
  preserveCslDismissals,
  type CslFieldStatus,
  type CslProvenance,
} from "@mdbase-reader/core";
import { parseClaimSourceLabel } from "@mdbase-reader/web-capture/citation-updates";

/** Stored labels remain machine-readable; only this presentation layer expands them. */
export function citationSourceLabel(label: string): string {
  const source = parseClaimSourceLabel(label) ?? parseClaimSourceLabel(label.split(" ")[0] ?? "");
  switch (source?.kind) {
    case "parent":
      return "From the book";
    case "registry":
      return source.name;
    case "site-adapter":
      return source.name.startsWith("citoid/")
        ? `${citoidTypeLabel(source.name.slice(7))} (via Citoid)`
        : `${source.name} (via Citoid)`;
    case "generic-remote":
      return source.name.toLowerCase() === "citoid" ? "Citoid" : source.name;
    case "page":
      return source.signal === "html" ? "page title" : "page metadata";
    case "user":
      return "edited manually";
    default:
      return "manual";
  }
}

export function citationStatusLabel(status: CslFieldStatus): string {
  switch (status.kind) {
    case "explained":
      return citationSourceLabel(status.provenance.source);
    case "edited":
      return "edited manually";
    case "removed":
      return "removed";
    case "unexplained":
      return "manual";
  }
}

/** Evidence is stored as a source label followed by optional free-form detail. */
export function citationEvidenceLabel(evidence: string): string {
  const [label = "", ...detail] = evidence.split(" ");
  return parseClaimSourceLabel(label)
    ? [citationSourceLabel(label), detail.join(" ")].filter(Boolean).join(" · ")
    : evidence;
}

/** Typed fields become user-owned; omissions retain a pinned value to prevent resurrection. */
export function editedCitationProvenance(
  previous: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>,
  provenance: CslProvenance,
): CslProvenance {
  const result = { ...provenance };
  for (const field of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    if (cslValuesEqual(previous[field], next[field])) {
      continue;
    }
    if (next[field] !== undefined) {
      result[field] = { value: next[field], source: "user" };
    } else if (previous[field] !== undefined) {
      result[field] ??= { value: previous[field], source: "user" };
    }
  }
  return preserveCslDismissals(result, provenance);
}

function citoidTypeLabel(type: string): string {
  return type === "encyclopediaArticle" ? "Encyclopedia article" : "Site translator";
}

import {
  cslValuesEqual,
  preserveCslDismissals,
  type CslFieldStatus,
  type CslProvenance,
} from "@mdbase-reader/core";
import {
  isEmbeddedMetadataEvidence,
  parseClaimSourceLabel,
} from "@mdbase-reader/web-capture/citation-updates";

/**
 * Stored labels remain machine-readable; only this presentation layer expands them. Labels follow
 * the evidence kind, not the provider that happened to deliver it.
 */
export function citationSourceLabel(label: string): string {
  const source = parseClaimSourceLabel(label) ?? parseClaimSourceLabel(label.split(" ")[0] ?? "");
  switch (source?.kind) {
    case "parent":
      return "From the book";
    case "registry":
      return source.name;
    case "site-adapter":
      return siteAdapterLabel(source.name);
    case "generic-remote":
      return genericRemoteLabel(label);
    case "page":
      return source.signal === "html" ? "page title" : "page metadata";
    case "user":
      return "edited manually";
    default:
      return "other source";
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
      return "no recorded source";
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

/**
 * Generic remote claims come from two methods, told apart by what the stored label records:
 *
 * - A page URL sent to Citoid (at capture, refresh, or a URL lookup) is stored under the provider
 *   id `generic-remote:citoid` with the evidence `Citoid <itemType>`. When the item type is one
 *   only Zotero's Embedded Metadata translator produces (`webpage`, `newspaperArticle`, …), the
 *   values restate the page's own tags. Older labels without evidence came only from this path.
 * - A title, ISBN or PubMed lookup stores the candidate's descriptive provider instead, e.g.
 *   `generic-remote:Citoid (Zotero translators via Wikimedia)`, and records no evidence. So do
 *   remote results downgraded for uncertain identity (`generic-remote:doi.org doi.org CSL`).
 */
function genericRemoteLabel(label: string): string {
  const space = label.indexOf(" ");
  const name = label.slice(label.indexOf(":") + 1, space === -1 ? undefined : space);
  const evidence = space === -1 ? undefined : label.slice(space + 1);
  return name === "citoid" && (evidence === undefined || isEmbeddedMetadataEvidence(evidence))
    ? "From the web page"
    : "From an online lookup";
}

/**
 * A named site adapter (`Wikipedia`) names its site. One reached through a service records only
 * `service/itemType`; the item type names it where distinctive, otherwise it is the page.
 */
function siteAdapterLabel(name: string): string {
  const slash = name.indexOf("/");
  if (slash === -1) {
    return name;
  }
  return name.slice(slash + 1) === "encyclopediaArticle"
    ? "Encyclopedia article"
    : "From the web page";
}

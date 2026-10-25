import { validateCslItem } from "@mdbase-reader/core";

import type { Claim } from "./claims.js";
import type { CslProvenance } from "@mdbase-reader/core";

/** Only immediate-container metadata; never the chapter's identity or work-level details. */
const parentFieldMapping = [
  ["title", "container-title"],
  ["title-short", "container-title-short"],
  ["editor", "editor"],
  ["author", "container-author"],
  ["publisher", "publisher"],
  ["publisher-place", "publisher-place"],
  ["issued", "issued"],
  ["ISBN", "ISBN"],
  ["edition", "edition"],
  ["volume", "volume"],
  ["collection-title", "collection-title"],
  ["collection-number", "collection-number"],
  ["language", "language"],
  ["number-of-volumes", "number-of-volumes"],
] as const;

const inheritedFields: ReadonlySet<string> = new Set(parentFieldMapping.map(([, field]) => field));

export function isParentCitationField(field: string): boolean {
  return inheritedFields.has(field);
}

export interface ParentCitationClaimsOptions {
  /** Default true. Book authors retain their CSL role, even when the book also has editors. */
  readonly includeContainerAuthor?: boolean;
}

/**
 * Claims from the caller-selected immediate parent, not a traversal of its own containers.
 * Book authors become `container-author`, never chapter authors or invented editors; this is
 * safe even if the chapter has no author. The caller supplies the chapter title and type.
 *
 * Parent CSL is canonical, including external edits and removals. Parent provenance is accepted
 * for API symmetry but deliberately not replayed: its evidence is not independent evidence for
 * the chapter, nor permission to leak provider labels, paths, titles or record identifiers.
 * Each mapped field gets one `parent <CSL field>` vote, regardless of the parent's own source.
 */
export function parentCitationClaims(
  parentCsl: Readonly<Record<string, unknown>>,
  _parentProvenance: CslProvenance | undefined,
  observedAt: string,
  options: ParentCitationClaimsOptions = {},
): readonly Claim[] {
  return parentFieldMapping.flatMap(([from, field]): Claim[] => {
    if (from === "author" && options.includeContainerAuthor === false) {
      return [];
    }
    const value = parentCsl[from];
    if (
      value == null ||
      (typeof value === "string" && !value.trim()) ||
      (Array.isArray(value) && !value.length) ||
      !validateCslItem({ id: "parent", type: "chapter", [field]: value }).valid
    ) {
      return [];
    }
    return [{ field, value, source: { kind: "parent" }, evidence: from, observedAt }];
  });
}

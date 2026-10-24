import { cslFieldStatuses, type CslProvenance } from "@mdbase-reader/core";

import {
  citationDateText,
  commonCslTypes,
  cslFieldLabel,
  displayCslValue,
  specialistCslTypes,
} from "./citation-form-model.js";
import { citationStatusLabel } from "./citation-provenance.js";

type Citation = Readonly<Record<string, unknown>>;

export interface CitationDetailRow {
  readonly label: string;
  /** `null` when the field is empty; the row then reads “Not set”. */
  readonly value: string | null;
  /** The empty field is one a bibliography normally needs. */
  readonly needed?: boolean;
}

/** The short read-only list under the formatted citation; the editor holds everything else. */
export function citationDetailRows(citation: Citation): readonly CitationDetailRow[] {
  const type = text(citation["type"]);
  const contributors = names(citation["author"]);
  const editors = names(citation["editor"]);
  const issued = citationDateText(citation, "issued") || null;
  const container = text(citation["container-title"]);
  const needsContainer = type === "article-journal" || type === "chapter";
  const rows: CitationDetailRow[] = [
    { label: "Type", value: type ? typeLabel(type) : null, needed: true },
    contributors || !editors
      ? { label: "Authors", value: contributors, needed: !editors }
      : { label: "Editors", value: editors },
    { label: "Published", value: issued, needed: true },
  ];
  if (container || needsContainer) {
    rows.push({ label: containerLabel(type), value: container, needed: needsContainer });
  }
  const publisher = text(citation["publisher"]);
  if (publisher) {
    rows.push({ label: "Publisher", value: publisher });
  }
  const identifiers = citationIdentifiers(citation);
  if (identifiers) {
    rows.push({ label: "Identifiers", value: identifiers });
  }
  return rows;
}

/** DOI, ISBN, PMID and URL as one plain line, e.g. “DOI 10.1000/1 · ISBN 978…”. */
export function citationIdentifiers(citation: Citation): string | null {
  const parts = ["DOI", "ISBN", "ISSN", "PMID", "PMCID"].flatMap((field) => {
    const value = text(citation[field]);
    return value ? [`${cslFieldLabel(field)} ${value}`] : [];
  });
  const url = text(citation["URL"]);
  return [...parts, ...(url ? [url] : [])].join(" · ") || null;
}

export interface CitationHealth {
  readonly tone: "invalid" | "check" | "complete";
  readonly title: string;
  readonly detail?: string;
}

/**
 * One status line: whether the draft can be saved, how many details need checking, and the
 * first of them in words. Fields the library already records count as details to check.
 */
export function citationHealth(input: {
  readonly valid: boolean;
  readonly message?: string | undefined;
  readonly warnings: readonly string[];
  readonly gaps: readonly string[];
}): CitationHealth {
  if (!input.valid) {
    return {
      tone: "invalid",
      title: "Fix before saving",
      ...(input.message ? { detail: input.message } : {}),
    };
  }
  const gapLabels = input.gaps.map((field) => gapFieldLabels[field] ?? cslFieldLabel(field));
  const gapDetail = gapLabels.length
    ? `The library records the ${listPhrase(gapLabels)}; add ${gapLabels.length === 1 ? "it" : "them"} to the citation.`
    : undefined;
  const warnings = uncoveredWarnings(input.warnings, input.gaps);
  const count = warnings.length + input.gaps.length;
  if (!count) {
    return { tone: "complete", title: "Citation details look complete" };
  }
  const detail = gapDetail ?? warnings[0];
  return {
    tone: "check",
    title: `${String(count)} ${count === 1 ? "detail" : "details"} to check`,
    ...(detail ? { detail } : {}),
  };
}

/**
 * The completeness warnings (from `citationCompletenessWarnings` in core) that name a field are
 * keyed by it, so a missing date the library records is one detail to check, not two.
 */
export const warningFields: Readonly<Record<string, string>> = {
  "No author or editor is recorded.": "author",
  "No publication date is recorded.": "issued",
};

/** Completeness warnings not already covered by a field the library can fill. */
export function uncoveredWarnings(
  warnings: readonly string[],
  gaps: readonly string[],
): readonly string[] {
  return [...new Set(warnings)].filter((warning) => {
    const field = warningFields[warning];
    return field === undefined || !gaps.includes(field);
  });
}

/** Distinct evidence labels in order of first use, e.g. “doi.org · page title”. */
export function citationEvidenceSummary(citation: Citation, provenance: CslProvenance): string {
  const labels = Object.entries(cslFieldStatuses(citation, provenance))
    .filter(([field, status]) => field !== "id" && status.kind !== "removed")
    .map(([, status]) => citationStatusLabel(status));
  const distinct = [...new Set(labels)];
  return distinct.length > 2
    ? `${distinct.slice(0, 2).join(" · ")} +${String(distinct.length - 2)}`
    : distinct.join(" · ");
}

const gapFieldLabels: Record<string, string> = { author: "authors", issued: "date", URL: "URL" };

function typeLabel(type: string): string {
  return (
    [...commonCslTypes, ...specialistCslTypes].find(([value]) => value === type)?.[1] ??
    cslFieldLabel(type)
  );
}

function containerLabel(type: string | null): string {
  switch (type) {
    case "article-journal":
      return "Journal";
    case "chapter":
      return "Book";
    case "webpage":
    case "post-weblog":
      return "Site";
    default:
      return "Published in";
  }
}

function names(value: unknown): string | null {
  return Array.isArray(value) && value.length
    ? value.map((name: unknown) => displayCslValue(name)).join(", ")
    : null;
}

function listPhrase(items: readonly string[]): string {
  return items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}

function text(value: unknown): string | null {
  if (typeof value === "number") {
    return String(value);
  }
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

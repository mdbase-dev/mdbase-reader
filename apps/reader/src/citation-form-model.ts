import { i18n } from "@lingui/core";
import { msg, t } from "@lingui/core/macro";
import { cslFieldDefinitions, cslTypes } from "@mdbase-reader/core";

import { citationLabels } from "./citation-labels.js";

import type {
  CitationResolutionRequest,
  CslFieldDefinition,
  CslFieldKind,
  CslItem,
} from "@mdbase-reader/core";

export const commonCslTypes = [
  ["article-journal", msg({ message: "Journal article", context: "CSL item type" })],
  ["book", msg({ message: "Book", context: "CSL item type" })],
  ["chapter", msg({ message: "Book chapter", context: "CSL item type" })],
  ["webpage", msg({ message: "Web page", context: "CSL item type" })],
  ["paper-conference", msg({ message: "Conference paper", context: "CSL item type" })],
  ["thesis", msg({ message: "Thesis", context: "CSL item type" })],
  ["report", msg({ message: "Report", context: "CSL item type" })],
  ["dataset", msg({ message: "Dataset", context: "CSL item type" })],
  ["software", msg({ message: "Software", context: "CSL item type" })],
  ["article-newspaper", msg({ message: "Newspaper article", context: "CSL item type" })],
  ["article-magazine", msg({ message: "Magazine article", context: "CSL item type" })],
  ["post-weblog", msg({ message: "Blog post", context: "CSL item type" })],
  ["document", msg({ message: "Document", context: "CSL item type" })],
] as const;

export const specialistCslTypes = [...cslTypes]
  .filter((type) => !commonCslTypes.some(([common]) => common === type))
  .sort((left, right) => left.localeCompare(right))
  .map(
    (type) =>
      [type, citationLabels[type] ?? msg({ message: "Other", context: "CSL item type" })] as const,
  );

export const primaryCitationFields = new Set([
  "id",
  "type",
  "title",
  "author",
  "editor",
  "translator",
  "issued",
  "container-title",
  "publisher",
  "publisher-place",
  "volume",
  "issue",
  "page",
  "edition",
  "DOI",
  "ISBN",
  "ISSN",
  "URL",
  "language",
  "abstract",
]);

export const additionalCslFieldDefinitions: readonly CslFieldDefinition[] =
  cslFieldDefinitions.filter(({ name }) => !primaryCitationFields.has(name));

export function cslFieldLabel(field: string): string {
  const knownAcronyms = new Map([
    ["DOI", "DOI"],
    ["ISBN", "ISBN"],
    ["ISSN", "ISSN"],
    ["PMCID", "PMCID"],
    ["PMID", "PMID"],
    ["URL", "URL"],
  ]);
  const label = citationLabels[field];
  return knownAcronyms.get(field) ?? (label ? i18n._(label) : field);
}

export function emptyCslFieldValue(kind: CslFieldKind): unknown {
  if (kind === "name" || kind === "string-list") {
    return [];
  }
  if (kind === "date" || kind === "object") {
    return {};
  }
  return "";
}

export function serializeCitation(citation: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(citation, null, 2);
}

export function updateCitationField(
  citation: Readonly<Record<string, unknown>>,
  field: string,
  value: unknown,
): Readonly<Record<string, unknown>> {
  const updated = { ...citation };
  if (emptyValue(value)) {
    return Object.fromEntries(Object.entries(updated).filter(([key]) => key !== field));
  } else {
    updated[field] = value;
  }
  return updated;
}

export function citationNames(
  citation: Readonly<Record<string, unknown>>,
  field: string,
): readonly CslName[] {
  const value = citation[field];
  return Array.isArray(value) ? value.filter(isCslName) : [];
}

export interface CslName {
  readonly family?: string;
  readonly given?: string;
  readonly literal?: string;
  readonly suffix?: string;
  readonly "dropping-particle"?: string;
  readonly "non-dropping-particle"?: string;
  readonly "comma-suffix"?: string | number | boolean;
  readonly "static-ordering"?: string | number | boolean;
  readonly "parse-names"?: string | number | boolean;
}

export function citationDateText(
  citation: Readonly<Record<string, unknown>>,
  field: string,
): string {
  const value = citation[field];
  if (!record(value)) {
    return "";
  }
  const parts = value["date-parts"];
  if (Array.isArray(parts) && Array.isArray(parts[0])) {
    return parts[0]
      .map(String)
      .join("-")
      .replace(/-(\d)(?=-|$)/gu, "-0$1");
  }
  return text(value["raw"]) ?? text(value["literal"]) ?? "";
}

export function cslDate(value: string): Readonly<Record<string, unknown>> | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const match = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/u.exec(trimmed);
  if (!match?.[1]) {
    return { literal: trimmed };
  }
  return {
    "date-parts": [
      [match[1], match[2], match[3]]
        .filter((part): part is string => part !== undefined)
        .map(Number),
    ],
  };
}

export function citationDifferences(
  current: Readonly<Record<string, unknown>>,
  candidate: CslItem,
): readonly CitationDifference[] {
  return Object.entries(candidate)
    .filter(
      ([field, value]) =>
        field !== "id" && JSON.stringify(current[field]) !== JSON.stringify(value),
    )
    .map(([field, value]) => ({ field, current: current[field], candidate: value }));
}

export interface CitationDifference {
  readonly field: string;
  readonly current: unknown;
  readonly candidate: unknown;
}

export function mergeCitation(
  current: Readonly<Record<string, unknown>>,
  candidate: CslItem,
  fields: ReadonlySet<string>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries([
    ...Object.entries(current),
    ...Object.entries(candidate).filter(([field]) => field !== "id" && fields.has(field)),
  ]);
}

export function resolutionRequest(value: string): CitationResolutionRequest {
  const trimmed = value.trim();
  if (/^https?:\/\//iu.test(trimmed)) {
    return { kind: "url", value: trimmed };
  }
  if (
    /^(?:doi:\s*)?10\.\d{4,9}\//iu.test(trimmed) ||
    /^(?:isbn|pmid|pmcid|arxiv):?/iu.test(trimmed)
  ) {
    return { kind: "identifier", value: trimmed };
  }
  return { kind: "text", value: trimmed };
}

export function displayCslValue(value: unknown): string {
  if (value === undefined) {
    return t`Not recorded`;
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? t`Yes` : t`No`;
  }
  if (Array.isArray(value)) {
    return value.map(displayCslValue).join("; ");
  }
  if (record(value)) {
    const literal = text(value["literal"]);
    if (literal) {
      return literal;
    }
    const name = [text(value["given"]), text(value["family"])].filter(Boolean).join(" ");
    if (name) {
      return name;
    }
    const parts = value["date-parts"];
    if (Array.isArray(parts) && Array.isArray(parts[0])) {
      return parts[0].map(String).join("-");
    }
    return Object.entries(value)
      .map(([field, fieldValue]) => `${cslFieldLabel(field)}: ${displayCslValue(fieldValue)}`)
      .join(", ");
  }
  return t`Unsupported value`;
}

function emptyValue(value: unknown): boolean {
  return value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function isCslName(value: unknown): value is CslName {
  return record(value);
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

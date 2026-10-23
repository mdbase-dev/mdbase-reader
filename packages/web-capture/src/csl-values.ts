import { cslFieldKinds, cslTypes, validateCslItem } from "@mdbase-reader/core";

/** A citation before Reader assigns its citekey. */
export type CitationDraft = Readonly<Record<string, unknown>> & { readonly type: string };

export interface CslName {
  readonly family?: string;
  readonly given?: string;
  readonly literal?: string;
}

/** "Smith, Jane", "Jane Smith" and "Smith J" become structured CSL names. */
export function cslName(value: string): CslName | undefined {
  const name = value.replace(/\s+/gu, " ").trim();
  if (!name) {
    return undefined;
  }
  if (name.includes(",")) {
    const [family = "", ...given] = name.split(",");
    const rest = given.join(",").trim();
    return family.trim() ? { family: family.trim(), ...(rest ? { given: rest } : {}) } : undefined;
  }
  const parts = name.split(" ");
  if (parts.length === 1) {
    return { literal: name };
  }
  const family = parts.pop() ?? "";
  return { family, given: parts.join(" ") };
}

const months = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function namedDate(value: string): number[] | undefined {
  const monthFirst = /^([a-z]+)\.?\s+(?:(\d{1,2}),?\s+)?(\d{4})$/iu.exec(value.trim());
  const dayFirst = /^(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})$/iu.exec(value.trim());
  const name = monthFirst?.[1] ?? dayFirst?.[2];
  const month = months.findIndex(
    (month) => month === name?.toLowerCase() || month.slice(0, 3) === name?.toLowerCase(),
  );
  if (month < 0) {
    return undefined;
  }
  const day = monthFirst?.[2] ?? dayFirst?.[1];
  return [Number(monthFirst?.[3] ?? dayFirst?.[3]), month + 1, ...(day ? [Number(day)] : [])];
}

/** ISO dates/timestamps and unambiguous English month-name dates; never locale-dependent parsing. */
export function cslDate(value: string | undefined): { "date-parts": number[][] } | undefined {
  const match = /^\s*(\d{4})(?:[-/.](\d{1,2}))?(?:[-/.](\d{1,2}))?/u.exec(value ?? "");
  const parts = match
    ? [match[1], match[2], match[3]]
        .filter((part): part is string => part !== undefined)
        .map(Number)
    : namedDate(value ?? "");
  return parts?.every((part) => Number.isFinite(part) && part > 0) &&
    (parts[1] ?? 1) <= 12 &&
    (parts[2] ?? 1) <= 31
    ? { "date-parts": [parts] }
    : undefined;
}

/**
 * Keeps only CSL 1.0 variables with valid values. Registries (Crossref, DataCite) add
 * bookkeeping such as `reference`, `license` and `indexed`, which CSL does not define and
 * which can be very large. Unknown types become `article`.
 */
export function sanitizedCitation(value: Readonly<Record<string, unknown>>): CitationDraft {
  const type =
    typeof value["type"] === "string" && cslTypes.has(value["type"]) ? value["type"] : "article";
  const candidate: Record<string, unknown> = { id: "candidate", type };
  for (const [field, fieldValue] of Object.entries(value)) {
    if (field !== "id" && field !== "type" && cslFieldKinds.has(field) && fieldValue !== "") {
      candidate[field] = fieldValue;
    }
  }
  // Drop individually invalid fields rather than discarding the whole record.
  const validation = validateCslItem(candidate);
  const invalid = new Set(
    validation.valid
      ? []
      : validation.problems.map(({ path }) => /^csl\.([^.[]+)/u.exec(path)?.[1]),
  );
  return Object.fromEntries(
    Object.entries(candidate).filter(([field]) => field !== "id" && !invalid.has(field)),
  ) as CitationDraft;
}

/** Fields from `fallback` fill gaps in `primary` (e.g. a registry record missing an abstract). */
export function mergedCitation(
  primary: CitationDraft,
  fallback: CitationDraft | undefined,
): CitationDraft {
  return fallback ? { ...fallback, ...primary } : primary;
}

export function citationYear(citation: CitationDraft): number | undefined {
  const issued = citation["issued"] as { "date-parts"?: unknown[][] } | undefined;
  const year = issued?.["date-parts"]?.[0]?.[0];
  return typeof year === "number"
    ? year
    : typeof year === "string"
      ? Number(year) || undefined
      : undefined;
}

export function citationAuthors(citation: CitationDraft): string[] {
  const authors = citation["author"];
  if (!Array.isArray(authors)) {
    return [];
  }
  return authors.flatMap((author: CslName) => {
    const name = author.literal ?? [author.given, author.family].filter(Boolean).join(" ");
    return name ? [name] : [];
  });
}

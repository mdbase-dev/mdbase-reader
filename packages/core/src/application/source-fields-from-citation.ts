import type { CslItem } from "../domain/citation.js";

/** Friendly source fields that citation metadata can fill (DATA_MODEL §11.3). */
export const citationBackedSourceFields = ["title", "authors", "published", "url"] as const;
export type CitationBackedSourceField = (typeof citationBackedSourceFields)[number];

export interface SourceFieldDifference {
  readonly field: CitationBackedSourceField;
  readonly current: unknown;
  readonly citation: string | number | readonly string[];
}

/**
 * The friendly fields a citation implies. Fields the citation leaves empty are omitted, so
 * applying the result never removes anything from the source.
 */
export function sourceFieldsFromCitation(
  citation: CslItem,
): Partial<Record<CitationBackedSourceField, string | number | readonly string[]>> {
  const title = text(citation["title"]);
  const authors = names(citation["author"]);
  const published = publishedValue(citation["issued"]);
  const url = text(citation["URL"]);
  return {
    ...(title ? { title } : {}),
    ...(authors.length ? { authors } : {}),
    ...(published !== undefined ? { published } : {}),
    ...(url ? { url } : {}),
  };
}

/**
 * Where the source's friendly fields disagree with its citation. A source date that is more
 * precise than the citation's (2002-03-01 against 2002) is not a difference.
 */
export function sourceCitationDifferences(
  frontmatter: Readonly<Record<string, unknown>>,
  citation: CslItem,
): readonly SourceFieldDifference[] {
  const fields = sourceFieldsFromCitation(citation);
  return citationBackedSourceFields.flatMap((field) => {
    const value = fields[field];
    if (value === undefined || matches(field, frontmatter[field], value)) {
      return [];
    }
    return [{ field, current: frontmatter[field], citation: value }];
  });
}

function matches(
  field: CitationBackedSourceField,
  current: unknown,
  value: string | number | readonly string[],
): boolean {
  if (Array.isArray(value)) {
    return (
      Array.isArray(current) &&
      current.length === value.length &&
      current.every((item, index) => typeof item === "string" && item.trim() === value[index])
    );
  }
  if (typeof current !== "string" && typeof current !== "number") {
    return false;
  }
  const currentText = String(current).trim();
  return field === "published"
    ? currentText.startsWith(String(value))
    : currentText === String(value);
}

function names(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((name: unknown) => {
    if (typeof name !== "object" || name === null) {
      return [];
    }
    const parts = name as Readonly<Record<string, unknown>>;
    const rendered =
      text(parts["literal"]) ??
      [
        parts["given"],
        parts["dropping-particle"],
        parts["non-dropping-particle"],
        parts["family"],
        parts["suffix"],
      ]
        .map(text)
        .filter(Boolean)
        .join(" ");
    return rendered ? [rendered] : [];
  });
}

/** A bare year stays a number, as capture writes it; fuller dates become ISO text. */
function publishedValue(value: unknown): string | number | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const date = value as Readonly<Record<string, unknown>>;
  const parts = Array.isArray(date["date-parts"]) ? (date["date-parts"] as unknown[])[0] : null;
  if (Array.isArray(parts) && parts.length && parts.every((part) => /^\d+$/u.test(String(part)))) {
    const [year, ...rest] = parts.map(Number);
    return rest.length
      ? [String(year), ...rest.map((part) => String(part).padStart(2, "0"))].join("-")
      : year;
  }
  return text(date["raw"]) ?? text(date["literal"]);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

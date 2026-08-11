import type { CslItem } from "../domain/citation.js";
import type { SourceId } from "../domain/identity.js";
import type { SourceSummary } from "../domain/source.js";

const stopWords = new Set(["a", "an", "and", "for", "in", "of", "on", "the", "to"]);

export function citekeyForCitation(
  citation: Readonly<Record<string, unknown>>,
  sources: readonly SourceSummary[],
  sourceId?: SourceId,
): string {
  const base = baseCitekey(citation);
  const used = new Set(
    sources
      .filter((source) => source.id !== sourceId)
      .map((source) => source.citation?.id)
      .filter((value): value is string => value !== undefined),
  );
  if (!used.has(base)) {
    return base;
  }
  for (let index = 0; index < 26; index += 1) {
    const candidate = `${base}${String.fromCharCode(97 + index)}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  let index = 27;
  while (used.has(`${base}${String(index)}`)) {
    index += 1;
  }
  return `${base}${String(index)}`;
}

export function citationCompletenessWarnings(citation: CslItem): readonly string[] {
  const warnings: string[] = [];
  if (!text(citation["title"])) {
    warnings.push("Add a title before using this citation in a bibliography.");
  }
  if (!hasNames(citation["author"]) && !hasNames(citation["editor"])) {
    warnings.push("No author or editor is recorded.");
  }
  if (!citation["issued"]) {
    warnings.push("No publication date is recorded.");
  }
  if (citation.type === "article-journal" && !text(citation["container-title"])) {
    warnings.push("A journal article normally needs a journal title.");
  }
  if (citation.type === "chapter" && !text(citation["container-title"])) {
    warnings.push("A chapter normally needs a book or collection title.");
  }
  if (/^https?:\/\/(?:dx\.)?doi\.org\//iu.test(text(citation["DOI"]) ?? "")) {
    warnings.push("Store the bare DOI rather than its https://doi.org/ URL.");
  }
  return warnings;
}

function baseCitekey(citation: Readonly<Record<string, unknown>>): string {
  const first: unknown = Array.isArray(citation["author"]) ? citation["author"][0] : undefined;
  const author = object(first) ? (text(first["family"]) ?? text(first["literal"])) : undefined;
  const title = text(citation["title"]) ?? "reference";
  const titleWord = title
    .split(/\s+/u)
    .map(slug)
    .find((word) => word && !stopWords.has(word));
  const year = dateYear(citation["issued"]);
  const rendered = slug(`${author ?? "ref"}${titleWord ?? "source"}${year}`);
  return rendered.length >= 3 ? rendered : "reference";
}

function dateYear(value: unknown): string {
  if (!object(value)) {
    return "";
  }
  const parts = value["date-parts"];
  if (Array.isArray(parts) && Array.isArray(parts[0])) {
    return typeof parts[0][0] === "string" || typeof parts[0][0] === "number"
      ? String(parts[0][0])
      : "";
  }
  return /\b\d{4}\b/u.exec(text(value["raw"]) ?? text(value["literal"]) ?? "")?.[0] ?? "";
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}_]+/gu, "")
    .toLocaleLowerCase();
}

function hasNames(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function object(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

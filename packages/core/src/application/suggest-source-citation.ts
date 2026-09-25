import type { CslItem } from "../domain/citation.js";
import type { Source } from "../domain/source.js";

const titleStopWords = new Set(["a", "an", "and", "of", "on", "the", "to"]);

export function suggestSourceCitation(source: Source): CslItem {
  const frontmatter = source.frontmatter;
  const authors = source.creators.length ? source.creators : textArray(frontmatter["authors"]);
  const published = source.published ?? textOrNumber(frontmatter["published"]);
  const url = source.url ?? text(frontmatter["url"]);
  const site = source.site ?? text(frontmatter["site"]);
  const description = text(frontmatter["description"]);
  const language = text(frontmatter["language"]);
  const type = citationType(source.kind ?? text(frontmatter["kind"]), url);
  return {
    id: suggestedCitekey(source.title, authors, published, source.id),
    type,
    title: source.title,
    ...(authors.length ? { author: authors.map((literal) => ({ literal })) } : {}),
    ...(issuedDate(published) ? { issued: issuedDate(published) } : {}),
    ...(url ? { URL: url } : {}),
    ...(site ? { "container-title": site } : {}),
    ...(description ? { abstract: description } : {}),
    ...(language ? { language } : {}),
  };
}

export function suggestedCitekey(
  title: string,
  authors: readonly string[],
  published: string | number | undefined,
  fallbackIdentity: string,
): string {
  const author = authors[0]?.trim().split(/\s+/u).at(-1) ?? "";
  const titleWord =
    title
      .split(/\s+/u)
      .map(sanitizePart)
      .find((word) => word && !titleStopWords.has(word)) ?? "";
  const year = publicationYear(published);
  const rendered = sanitizePart(`${author}${titleWord}${year}`);
  if (rendered.length >= 3) {
    return rendered;
  }
  const identity = sanitizePart(fallbackIdentity).slice(-8);
  return `ref${identity || "source"}`;
}

function citationType(kind: string | undefined, url: string | undefined): string {
  const mapped: Readonly<Record<string, string>> = {
    article: "article",
    book: "book",
    chapter: "chapter",
    paper: "paper-conference",
    newsletter_issue: "post-weblog",
    webpage: "webpage",
    post: "post-weblog",
    document: "document",
  };
  return (kind ? mapped[kind] : undefined) ?? (url ? "webpage" : "document");
}

function issuedDate(value: string | number | undefined): Readonly<Record<string, unknown>> | null {
  const raw = value === undefined ? "" : String(value).trim();
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/u.exec(raw);
  if (!match?.[1]) {
    return raw ? { raw } : null;
  }
  const parts = [match[1], match[2], match[3]]
    .filter((part): part is string => part !== undefined)
    .map(Number);
  return { "date-parts": [parts] };
}

function publicationYear(value: string | number | undefined): string {
  return /\b\d{4}\b/u.exec(value === undefined ? "" : String(value))?.[0] ?? "";
}

function sanitizePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}_]+/gu, "")
    .toLocaleLowerCase();
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function textArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function textOrNumber(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

/** Citation fields the library record can fill in (DATA_MODEL §11.3). */
export const sourceBackedCitationFields = ["author", "issued", "URL"] as const;

/**
 * Values the library record has for citation fields the citation leaves empty. Filling gaps
 * never overwrites what the citation already says.
 */
export function citationGapsFromSource(
  citation: Readonly<Record<string, unknown>>,
  source: Source,
): Partial<Record<(typeof sourceBackedCitationFields)[number], unknown>> {
  const suggested = suggestSourceCitation(source);
  return Object.fromEntries(
    sourceBackedCitationFields.flatMap((field) =>
      isEmptyCitationValue(citation[field]) && !isEmptyCitationValue(suggested[field])
        ? [[field, suggested[field]]]
        : [],
    ),
  );
}

function isEmptyCitationValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

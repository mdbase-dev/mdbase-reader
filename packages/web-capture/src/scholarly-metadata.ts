import { cslDate, cslName, sanitizedCitation, type CitationDraft } from "./csl-values.js";
import { arxivIdentifier, doiFromText, doiFromUrl } from "./doi.js";

/**
 * Bibliographic metadata publishers embed for indexers: Highwire Press `citation_*` tags
 * (required by Google Scholar), PRISM, Dublin Core and schema.org JSON-LD. This mirrors
 * Zotero's generic "Embedded Metadata" translator; it does not replace site translators.
 */
export interface ScholarlyMetadata {
  readonly doi?: string;
  readonly pdfUrl?: string;
  /** Present only when the page carries scholarly evidence, not for ordinary web pages. */
  readonly citation?: CitationDraft;
}

type MetaIndex = ReadonlyMap<string, readonly string[]>;

const scholarlyJsonLdTypes = new Set([
  "ScholarlyArticle",
  "MedicalScholarlyArticle",
  "Book",
  "Chapter",
  "Thesis",
  "Report",
  "Dataset",
]);

export function extractScholarlyMetadata(document: Document, pageUrl: string): ScholarlyMetadata {
  const meta = metaIndex(document);
  const linked = scholarlyJsonLd(document);
  const doi =
    doiFromText(first(meta, "citation_doi", "prism.doi", "dc.identifier", "dcterms.identifier")) ??
    doiFromUrl(pageUrl) ??
    doiFromText(stringValue(linked?.["identifier"]) ?? stringValue(linked?.["@id"])) ??
    arxivDoi(first(meta, "citation_arxiv_id") ?? arxivIdentifier(pageUrl));
  const pdfUrl = absoluteHttps(first(meta, "citation_pdf_url"), pageUrl);
  const scholarly =
    [...meta.keys()].some((key) => key.startsWith("citation_") || key.startsWith("prism.")) ||
    Boolean(doi) ||
    Boolean(linked);
  if (!scholarly) {
    return { ...(pdfUrl ? { pdfUrl } : {}) };
  }
  const citation = sanitizedCitation({
    ...jsonLdCitation(linked),
    ...embeddedCitation(meta),
    ...(doi ? { DOI: doi } : {}),
    URL: pageUrl,
  });
  return { ...(doi ? { doi } : {}), ...(pdfUrl ? { pdfUrl } : {}), citation };
}

function embeddedCitation(meta: MetaIndex): Record<string, unknown> {
  const authors = [
    ...all(meta, "citation_author"),
    ...all(meta, "citation_authors").flatMap((value) => value.split(";")),
  ];
  const names = (authors.length ? authors : all(meta, "dc.creator", "dcterms.creator"))
    .map(cslName)
    .filter(Boolean);
  const firstPage = first(meta, "citation_firstpage", "prism.startingpage");
  const lastPage = first(meta, "citation_lastpage", "prism.endingpage");
  const keywords = all(meta, "citation_keywords").flatMap((value) => value.split(/[;,]/u));
  return defined({
    type: embeddedType(meta),
    title: first(meta, "citation_title", "dc.title", "dcterms.title"),
    author: names.length ? names : undefined,
    issued: cslDate(
      first(
        meta,
        "citation_publication_date",
        "citation_date",
        "citation_cover_date",
        "prism.publicationdate",
        "prism.coverdate",
        "citation_online_date",
        "dcterms.issued",
        "dc.date",
        "citation_year",
      ),
    ),
    "container-title": first(
      meta,
      "citation_journal_title",
      "citation_conference_title",
      "citation_inbook_title",
      "citation_book_title",
      "prism.publicationname",
    ),
    "container-title-short": first(meta, "citation_journal_abbrev"),
    "collection-title": first(meta, "citation_series_title"),
    publisher: first(
      meta,
      "citation_publisher",
      "citation_dissertation_institution",
      "citation_technical_report_institution",
      "dc.publisher",
      "dcterms.publisher",
    ),
    volume: first(meta, "citation_volume", "prism.volume"),
    issue: first(meta, "citation_issue", "prism.number"),
    number: first(meta, "citation_technical_report_number"),
    page: firstPage
      ? lastPage && lastPage !== firstPage
        ? `${firstPage}-${lastPage}`
        : firstPage
      : undefined,
    ISSN: first(meta, "citation_issn", "prism.issn"),
    ISBN: first(meta, "citation_isbn"),
    abstract: first(meta, "citation_abstract", "dcterms.abstract"),
    language: first(meta, "citation_language", "dc.language"),
    keyword: keywords.length
      ? keywords
          .map((word) => word.trim())
          .filter(Boolean)
          .join(", ")
      : undefined,
  });
}

function embeddedType(meta: MetaIndex): string | undefined {
  const types: readonly [string, string][] = [
    ["citation_dissertation_institution", "thesis"],
    ["citation_technical_report_institution", "report"],
    ["citation_conference_title", "paper-conference"],
    ["citation_inbook_title", "chapter"],
    ["citation_book_title", "chapter"],
    ["citation_journal_title", "article-journal"],
    ["prism.publicationname", "article-journal"],
    ["citation_isbn", "book"],
  ];
  return types.find(([key]) => meta.has(key))?.[1];
}

function jsonLdCitation(
  node: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  if (!node) {
    return {};
  }
  const type = stringValue(node["@type"]) ?? "";
  const authors = arrayValue(node["author"])
    .map((author) => (typeof author === "string" ? author : nameOf(author)))
    .flatMap((name) => (name ? [cslName(name)] : []));
  const container = nameOf(node["isPartOf"]);
  return defined({
    type: {
      Book: "book",
      Chapter: "chapter",
      Thesis: "thesis",
      Report: "report",
      Dataset: "dataset",
    }[type],
    title: stringValue(node["headline"]) ?? stringValue(node["name"]),
    author: authors.length ? authors : undefined,
    issued: cslDate(stringValue(node["datePublished"])),
    "container-title": container,
    publisher: nameOf(node["publisher"]),
    abstract: stringValue(node["description"]),
    ISBN: stringValue(node["isbn"]),
  });
}

function scholarlyJsonLd(document: Document): Readonly<Record<string, unknown>> | undefined {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent);
    } catch {
      continue;
    }
    const found = jsonLdNodes(parsed).find((node) =>
      arrayValue(node["@type"]).some(
        (type) => typeof type === "string" && scholarlyJsonLdTypes.has(type),
      ),
    );
    if (found) {
      return found;
    }
  }
  return undefined;
}

function jsonLdNodes(value: unknown, depth = 0): Readonly<Record<string, unknown>>[] {
  if (depth > 4) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => jsonLdNodes(item, depth + 1));
  }
  if (!isRecord(value)) {
    return [];
  }
  return [value, ...jsonLdNodes(value["@graph"], depth + 1)];
}

function metaIndex(document: Document): MetaIndex {
  const index = new Map<string, string[]>();
  for (const element of document.querySelectorAll<HTMLMetaElement>("meta[name], meta[property]")) {
    const key = (
      element.getAttribute("name") ??
      element.getAttribute("property") ??
      ""
    ).toLowerCase();
    const content = element.content.replace(/\s+/gu, " ").trim();
    if (key && content) {
      index.set(key, [...(index.get(key) ?? []), content]);
    }
  }
  return index;
}

function first(meta: MetaIndex, ...keys: readonly string[]): string | undefined {
  return keys.map((key) => meta.get(key)?.[0]).find((value) => value !== undefined);
}

function all(meta: MetaIndex, ...keys: readonly string[]): string[] {
  return keys.flatMap((key) => meta.get(key) ?? []);
}

function arxivDoi(identifier: string | undefined): string | undefined {
  const bare = identifier?.replace(/^arxiv:/iu, "").replace(/v\d+$/u, "");
  return bare ? `10.48550/arXiv.${bare}` : undefined;
}

function absoluteHttps(value: string | undefined, base: string): string | undefined {
  try {
    const url = value ? new URL(value, base) : undefined;
    return url?.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function nameOf(value: unknown): string | undefined {
  const node = Array.isArray(value) ? (value as unknown[])[0] : value;
  if (typeof node === "string") {
    return node;
  }
  if (!isRecord(node)) {
    return undefined;
  }
  const personal = [stringValue(node["givenName"]), stringValue(node["familyName"])].filter(
    Boolean,
  );
  return (
    stringValue(node["name"]) ?? (personal.length ? personal.join(" ") : nameOf(node["isPartOf"]))
  );
}

function stringValue(value: unknown): string | undefined {
  const candidate = Array.isArray(value) ? (value as unknown[])[0] : value;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

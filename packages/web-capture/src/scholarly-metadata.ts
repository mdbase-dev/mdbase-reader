import { cslDate, cslName, sanitizedCitation, type CitationDraft } from "./csl-values.js";
import { arxivIdentifier, doiFromText, doiFromUrl } from "./doi.js";
import { jsonLdNames, jsonLdNode, nameOf, stringValue } from "./json-ld.js";
import { all, defined, first, metaIndex, type MetaIndex } from "./meta-tags.js";
import { webArticleCitation } from "./web-article-metadata.js";

/**
 * Bibliographic metadata publishers embed for indexers: Highwire Press `citation_*` tags
 * (required by Google Scholar), PRISM, Dublin Core and schema.org JSON-LD, and for news and
 * blog articles, schema.org `Article` JSON-LD and Open Graph `article:*` tags. This mirrors
 * Zotero's generic "Embedded Metadata" translator; it does not replace site translators.
 */
export interface ScholarlyMetadata {
  readonly doi?: string;
  readonly pdfUrl?: string;
  /**
   * Present when the page carries scholarly evidence or declares itself an article; not for
   * ordinary pages that only have a title.
   */
  readonly citation?: CitationDraft;
}

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
  const doi = embeddedDoi(meta, linked, pageUrl);
  const pdfUrl = absoluteHttps(first(meta, "citation_pdf_url"), pageUrl);
  const scholarly =
    [...meta.keys()].some((key) => key.startsWith("citation_") || key.startsWith("prism.")) ||
    Boolean(doi) ||
    Boolean(linked);
  if (!scholarly) {
    const article = webArticleCitation(document, meta, pageUrl);
    return { ...(pdfUrl ? { pdfUrl } : {}), ...(article ? { citation: article } : {}) };
  }
  const citation = sanitizedCitation({
    ...jsonLdCitation(linked),
    ...embeddedCitation(meta),
    ...(doi ? { DOI: doi } : {}),
    URL: pageUrl,
  });
  return { ...(doi ? { doi } : {}), ...(pdfUrl ? { pdfUrl } : {}), citation };
}

function embeddedDoi(
  meta: MetaIndex,
  linked: Readonly<Record<string, unknown>> | undefined,
  pageUrl: string,
): string | undefined {
  return (
    doiFromText(first(meta, "citation_doi", "prism.doi", "dc.identifier", "dcterms.identifier")) ??
    doiFromUrl(pageUrl) ??
    doiFromText(stringValue(linked?.["identifier"]) ?? stringValue(linked?.["@id"])) ??
    arxivDoi(first(meta, "citation_arxiv_id") ?? arxivIdentifier(pageUrl))
  );
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
  const authors = jsonLdNames(node["author"]);
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
  return jsonLdNode(document, (type) => scholarlyJsonLdTypes.has(type));
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

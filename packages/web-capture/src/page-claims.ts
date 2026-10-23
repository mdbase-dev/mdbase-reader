import { cslDate, cslName } from "./csl-values.js";
import { arxivIdentifier, doiFromText, doiFromUrl } from "./doi.js";
import { arrayValue, isRecord, jsonLdNames, jsonLdNode, nameOf, stringValue } from "./json-ld.js";
import { all, first, metaIndex, type MetaIndex } from "./meta-tags.js";
import { absoluteHttps, arxivDoi, embeddedDoi } from "./metadata-identifiers.js";
import { articleJsonLdTypes, embeddedTypes, scholarlyJsonLdTypes } from "./metadata-types.js";

import type { Claim, ClaimBatch, ClaimIdentifiers, PageSignal } from "./claims.js";

type AddClaim = (field: string, value: unknown, signal: PageSignal, evidence: string) => void;
type JsonLdNode = Readonly<Record<string, unknown>>;

const metaFields: readonly (readonly [string, readonly string[]])[] = [
  ["title", ["citation_title", "dc.title", "dcterms.title", "og:title", "twitter:title"]],
  [
    "container-title",
    [
      "citation_journal_title",
      "citation_conference_title",
      "citation_inbook_title",
      "citation_book_title",
      "prism.publicationname",
      "og:site_name",
    ],
  ],
  ["container-title-short", ["citation_journal_abbrev"]],
  ["collection-title", ["citation_series_title"]],
  [
    "publisher",
    [
      "citation_publisher",
      "citation_dissertation_institution",
      "citation_technical_report_institution",
      "dc.publisher",
      "dcterms.publisher",
    ],
  ],
  ["volume", ["citation_volume", "prism.volume"]],
  ["issue", ["citation_issue", "prism.number"]],
  ["number", ["citation_technical_report_number"]],
  ["ISSN", ["citation_issn", "prism.issn"]],
  ["ISBN", ["citation_isbn"]],
  [
    "abstract",
    [
      "citation_abstract",
      "dcterms.abstract",
      "dc.description",
      "dcterms.description",
      "og:description",
      "description",
      "twitter:description",
    ],
  ],
  ["language", ["citation_language", "dc.language", "dcterms.language"]],
  ["section", ["article:section"]],
];

const dateKeys = [
  "citation_publication_date",
  "citation_date",
  "citation_cover_date",
  "prism.publicationdate",
  "prism.coverdate",
  "citation_online_date",
  "dcterms.issued",
  "dc.date",
  "citation_year",
  "article:published_time",
  "date",
];
const doiKeys = ["citation_doi", "prism.doi", "dc.identifier", "dcterms.identifier"];

/** Reports evidence without choosing a citation, changing the document or making requests. */
export function pageClaims(document: Document, pageUrl: string, observedAt: string): ClaimBatch {
  const claims: Claim[] = [];
  const add: AddClaim = (field, value, signal, evidence) => {
    if (value !== undefined && value !== "" && !(Array.isArray(value) && !value.length)) {
      claims.push({ field, value, source: { kind: "page", signal }, evidence, observedAt });
    }
  };
  const meta = metaIndex(document);
  const nodes = linkedNodes(document);
  if (challengePage(document, pageUrl, nodes)) {
    return { claims: [] };
  }
  for (const node of nodes) {
    linkedClaims(node, add);
  }
  tagClaims(meta, pageUrl, add);
  htmlClaims(document, pageUrl, add);
  const arxiv = first(meta, "citation_arxiv_id") ?? arxivIdentifier(pageUrl);
  add("DOI", doiFromUrl(pageUrl), "html", "page URL");
  for (const identifier of all(meta, "citation_arxiv_id")) {
    add("DOI", arxivDoi(identifier), "highwire", "citation_arxiv_id");
  }
  add("DOI", arxivDoi(arxivIdentifier(pageUrl)), "html", "page URL");
  for (const claim of claims.filter((claim) => claim.field === "DOI")) {
    if (claim.source.kind === "page") {
      add("type", "article", claim.source.signal, claim.evidence ?? "DOI");
    }
  }
  const scholarly = jsonLdNode(document, (type) => scholarlyJsonLdTypes.has(type));
  const identifiers: ClaimIdentifiers = {
    ...identifier("doi", embeddedDoi(meta, scholarly ?? nodes[0], pageUrl) ?? firstDoi(claims)),
    ...identifier("arxiv", arxiv?.replace(/^arxiv:/iu, "").trim()),
    ...identifier("isbn", first(meta, "citation_isbn")),
    ...identifier("pmid", first(meta, "citation_pmid")),
    ...identifier("pmcid", first(meta, "citation_pmcid")),
  };
  const pdfUrl = all(meta, "citation_pdf_url")
    .map((value) => absoluteHttps(value, pageUrl))
    .find((value) => value !== undefined);
  return {
    claims,
    ...(Object.keys(identifiers).length ? { identifiers } : {}),
    ...(pdfUrl ? { pdfUrl } : {}),
  };
}

function challengePage(document: Document, pageUrl: string, nodes: readonly JsonLdNode[]): boolean {
  const title = textValue(document.title) ?? "";
  if (
    /^(?:just a moment[.!…]*|attention required!?|access denied|are you a robot\??|human verification|verify (?:you are|you're) human|(?:error\s*)?403(?:\s*[-:]?\s*forbidden)?)(?:\s*[-|—]\s*.*)?$/iu.test(
      title,
    )
  ) {
    return true;
  }
  // Some interstitials expose only the bare host. That is not a work title; retain it only
  // when a work heading or structured title independently identifies actual content.
  try {
    const host = new URL(pageUrl).hostname.replace(/^www\./u, "");
    return (
      title.toLowerCase().replace(/^www\./u, "") === host &&
      !document.querySelector("h1") &&
      !nodes.some((node) => isWork(node) && (node["headline"] || node["name"]))
    );
  } catch {
    return false;
  }
}

function tagClaims(meta: MetaIndex, pageUrl: string, add: AddClaim): void {
  for (const [field, keys] of metaFields) {
    for (const key of keys) {
      for (const value of all(meta, key)) {
        add(field, value, metaSignal(key), key);
      }
    }
  }
  for (const key of dateKeys) {
    for (const value of all(meta, key)) {
      add("issued", cslDate(value), metaSignal(key), key);
    }
  }
  for (const key of doiKeys) {
    for (const value of all(meta, key)) {
      add("DOI", doiFromText(value), metaSignal(key), key);
    }
  }
  tagTypes(meta, add);
  for (const value of all(meta, "og:locale")) {
    add("language", value.replace("_", "-"), "open-graph", "og:locale");
  }
  for (const key of [
    "citation_public_url",
    "citation_abstract_html_url",
    "og:url",
    "twitter:url",
  ]) {
    for (const value of all(meta, key)) {
      add("URL", absoluteWebUrl(value, pageUrl), metaSignal(key), key);
    }
  }
  tagNames(meta, add);
  tagKeywords(meta, add);
  tagPages(meta, add);
}

function tagTypes(meta: MetaIndex, add: AddClaim): void {
  for (const [key, type] of embeddedTypes) {
    if (meta.has(key)) {
      add("type", type, "highwire", key);
    }
  }
  for (const prefix of ["citation_", "prism."]) {
    if ([...meta.keys()].some((key) => key.startsWith(prefix))) {
      add("type", "article", "highwire", `${prefix}*`);
    }
  }
  for (const value of all(meta, "og:type")) {
    if (["article", "website", "blog"].includes(value.toLowerCase())) {
      add("type", "webpage", "open-graph", "og:type");
    }
  }
  if (meta.has("article:published_time")) {
    add("type", "webpage", "open-graph", "article:published_time");
  }
}

function tagNames(meta: MetaIndex, add: AddClaim): void {
  const keys = [
    "citation_author",
    "citation_authors",
    "dc.creator",
    "dcterms.creator",
    "article:author",
    "author",
    "twitter:creator",
  ];
  for (const key of keys) {
    const authors = all(meta, key).flatMap((value) =>
      key === "citation_authors" ? value.split(";") : [value],
    );
    add("author", tagAuthorNames(authors), metaSignal(key), key);
  }
  for (const group of [
    ["citation_author", "citation_authors"],
    ["dc.creator", "dcterms.creator"],
  ] as const) {
    if (group.every((key) => meta.has(key))) {
      const authors = group.flatMap((key) =>
        all(meta, key).flatMap((value) =>
          key === "citation_authors" ? value.split(";") : [value],
        ),
      );
      add("author", tagAuthorNames(authors), metaSignal(group[0]), group.join(" + "));
    }
  }
}

function tagAuthorNames(authors: readonly string[]): ReturnType<typeof cslName>[] {
  // article:author commonly identifies a profile, not a person or an organisation's byline.
  return authors
    .filter((author) => !/^\s*(?:https?:)?\/\//iu.test(author))
    .map(cslName)
    .filter(Boolean);
}

function tagKeywords(meta: MetaIndex, add: AddClaim): void {
  for (const key of [
    "citation_keywords",
    "dc.subject",
    "dcterms.subject",
    "keywords",
    "article:tag",
  ]) {
    const words = all(meta, key)
      .flatMap((value) => (key === "article:tag" ? [value] : value.split(/[;,]/u)))
      .map((word) => word.trim())
      .filter(Boolean);
    add("keyword", words.join(", "), metaSignal(key), key);
  }
}

function tagPages(meta: MetaIndex, add: AddClaim): void {
  const lastKeys = ["citation_lastpage", "prism.endingpage"];
  for (const firstKey of ["citation_firstpage", "prism.startingpage"]) {
    for (const start of all(meta, firstKey)) {
      add("page-first", start, "highwire", firstKey);
      if (!all(meta, ...lastKeys).length) {
        add("page", start, "highwire", firstKey);
      }
      for (const lastKey of lastKeys) {
        for (const end of all(meta, lastKey)) {
          add(
            "page",
            start === end ? start : `${start}-${end}`,
            "highwire",
            `${firstKey} + ${lastKey}`,
          );
        }
      }
    }
  }
}

function linkedClaims(node: JsonLdNode, add: AddClaim): void {
  const signal = "json-ld";
  if (arrayValue(node["@type"]).includes("WebSite")) {
    add("container-title", nameOf(node), signal, "WebSite name");
    return;
  }
  const workType = specificWorkType(node);
  const fields = [
    ["headline", "title"],
    ["name", "title"],
    ["alternativeHeadline", "title"],
    ["description", "abstract"],
    ["inLanguage", "language"],
    ["articleSection", "section"],
    ["isbn", "ISBN"],
    ["issn", "ISSN"],
  ] as const;
  for (const [key, field] of fields) {
    for (const value of arrayValue(node[key])) {
      // Preserve the node's specificity so a generic WebPage name cannot outvote the work.
      const evidence =
        workType && (key === "headline" || key === "name") ? `${workType} ${key}` : key;
      add(field, stringValue(value), signal, evidence);
    }
  }
  add("author", jsonLdNames(node["author"]), signal, "author");
  for (const value of arrayValue(node["datePublished"])) {
    add("issued", cslDate(stringValue(value)), signal, "datePublished");
  }
  for (const value of arrayValue(node["publisher"])) {
    add("publisher", nameOf(value), signal, "publisher");
  }
  for (const value of arrayValue(node["isPartOf"])) {
    add("container-title", linkedContainer(value), signal, "isPartOf");
  }
  const words = arrayValue(node["keywords"])
    .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
    .map((word) => word.trim())
    .filter(Boolean);
  add("keyword", [...new Set(words)].join(", "), signal, "keywords");
  for (const key of ["identifier", "@id"]) {
    for (const value of arrayValue(node[key])) {
      const doi = doiFromText(stringValue(isRecord(value) ? value["value"] : value));
      add("DOI", doi, signal, key);
    }
  }
  for (const type of arrayValue(node["@type"])) {
    if (typeof type === "string") {
      linkedType(type, add);
    }
  }
}

function linkedContainer(value: unknown): string | undefined {
  // Article graphs often point to their own WebPage, not the containing publication.
  return isRecord(value) && arrayValue(value["@type"]).includes("WebPage")
    ? undefined
    : nameOf(value);
}

function specificWorkType(node: JsonLdNode): string | undefined {
  return arrayValue(node["@type"]).find(
    (type): type is string =>
      typeof type === "string" &&
      (scholarlyJsonLdTypes.has(type) ||
        (articleJsonLdTypes.has(type) && articleJsonLdTypes.get(type) !== "webpage")),
  );
}

function linkedType(type: string, add: AddClaim): void {
  const scholarlyTypes = new Map([
    ["Book", "book"],
    ["Chapter", "chapter"],
    ["Thesis", "thesis"],
    ["Report", "report"],
    ["Dataset", "dataset"],
  ]);
  const cslType =
    articleJsonLdTypes.get(type) ??
    scholarlyTypes.get(type) ??
    (scholarlyJsonLdTypes.has(type)
      ? "article-journal"
      : type === "WebPage"
        ? "webpage"
        : undefined);
  add("type", cslType, "json-ld", "@type");
}

function linkedNodes(document: Document): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      nodes.push(...graphNodes(JSON.parse(script.textContent)));
    } catch {
      continue;
    }
  }
  const byId = new Map(
    nodes.flatMap((node) =>
      typeof node["@id"] === "string" ? [[node["@id"], node] as const] : [],
    ),
  );
  const resolved = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(resolved)
      : isRecord(value) && typeof value["@id"] === "string" && Object.keys(value).length === 1
        ? (byId.get(value["@id"]) ?? value)
        : value;
  return nodes
    .filter((node) => isWork(node) || arrayValue(node["@type"]).includes("WebSite"))
    .map((node) => ({
      ...node,
      author: resolved(node["author"]),
      publisher: resolved(node["publisher"]),
      isPartOf: resolved(node["isPartOf"]),
    }));
}

function graphNodes(value: unknown, depth = 0): JsonLdNode[] {
  if (depth > 4) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => graphNodes(item, depth + 1));
  }
  return isRecord(value)
    ? [
        value,
        ...graphNodes(value["@graph"], depth + 1),
        ...graphNodes(value["mainEntity"], depth + 1),
      ]
    : [];
}

function isWork(node: JsonLdNode): boolean {
  return arrayValue(node["@type"]).some(
    (type) =>
      typeof type === "string" &&
      (scholarlyJsonLdTypes.has(type) || articleJsonLdTypes.has(type) || type === "WebPage"),
  );
}

function htmlClaims(document: Document, pageUrl: string, add: AddClaim): void {
  const title = textValue(document.title);
  add("title", title, "html", "title");
  const headings = document.querySelectorAll("h1");
  const heading =
    headings.length === 1 ? headings[0] : document.querySelector("main h1, article h1");
  add("title", textValue(heading?.textContent), "html", "h1");
  for (const link of document.querySelectorAll('link[rel~="canonical"]')) {
    add("URL", absoluteWebUrl(link.getAttribute("href") ?? "", pageUrl), "html", "canonical");
  }
  add("language", textValue(document.documentElement.getAttribute("lang")), "html", "html lang");
  add("URL", pageUrl, "html", "page URL");
  add("type", "webpage", "html", "document");
}

function metaSignal(key: string): PageSignal {
  if (key.startsWith("citation_") || key.startsWith("prism.")) {
    return "highwire";
  }
  if (key.startsWith("dc.") || key.startsWith("dcterms.")) {
    return "dublin-core";
  }
  return key.includes(":") ? "open-graph" : "html";
}

function textValue(value: string | null | undefined): string | undefined {
  const text = value?.replace(/\s+/gu, " ").trim();
  return text?.length ? text : undefined;
}

function absoluteWebUrl(value: string, base: string): string | undefined {
  try {
    const url = value.trim() ? new URL(value, base) : undefined;
    return url?.protocol === "https:" || url?.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function firstDoi(claims: readonly Claim[]): string | undefined {
  const value = claims.find((claim) => claim.field === "DOI")?.value;
  return typeof value === "string" ? value : undefined;
}

function identifier(key: keyof ClaimIdentifiers, value: string | undefined): ClaimIdentifiers {
  return value ? { [key]: value } : {};
}

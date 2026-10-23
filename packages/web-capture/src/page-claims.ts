import { cslDate, cslName } from "./csl-values.js";
import { arxivIdentifier, doiFromText, doiFromUrl } from "./doi.js";
import { arrayValue, isRecord, jsonLdNames, nameOf, schemaTypes, stringValue } from "./json-ld.js";
import { all, first, type MetaIndex } from "./meta-tags.js";
import { absoluteHttps, arxivDoi, embeddedDoi } from "./metadata-identifiers.js";
import {
  articleJsonLdTypes,
  bibliographicType,
  embeddedTypes,
  linkedWorkTypes,
  scholarlyJsonLdTypes,
} from "./metadata-types.js";
import { conventionCreatorRoles } from "./page-conventions-bibliographic.js";
import { pageConventionClaims } from "./page-conventions.js";
import { structuredWorkClaims } from "./page-structured.js";

import type { Claim, ClaimBatch, ClaimIdentifiers, PageSignal } from "./claims.js";

type AddClaim = (field: string, value: unknown, signal: PageSignal, evidence: string) => void;
type JsonLdNode = Readonly<Record<string, unknown>>;

// Page data is untrusted, not a bibliography import. On overflow keep the HTML/tag fallback,
// never a truncated graph whose first recommendation could masquerade as the captured work.
const maxLinkedCharacters = 2_000_000;
const maxLinkedNodes = 4_096;
const maxMetadataTags = 512;
const maxValues = 128;
const maxFieldClaims = 128;
const maxValueCharacters = 16_384;
const maxUnscopedWorks = 8;

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
  const counts = new Map<string, number>();
  const add: AddClaim = (field, value, signal, evidence) => {
    const count = counts.get(field) ?? 0;
    if (
      count < maxFieldClaims &&
      value !== undefined &&
      value !== "" &&
      !(Array.isArray(value) && !value.length) &&
      !(typeof value === "string" && value.length > maxValueCharacters)
    ) {
      counts.set(field, count + 1);
      claims.push({ field, value, source: { kind: "page", signal }, evidence, observedAt });
    }
  };
  const meta = boundedMetaIndex(document);
  const nodes = linkedNodes(document, pageUrl);
  if (challengePage(document, pageUrl, meta, nodes)) {
    return { claims: [], observedAt };
  }
  // Reserve room for document-level evidence even on pages with excessive linked values.
  htmlClaims(document, pageUrl, add);
  const html = claims.splice(0);
  tagClaims(meta, pageUrl, add);
  const documentClaims = [...claims.splice(0), ...html];
  const revision = wikiRevision(document);
  for (const node of nodes) {
    linkedClaims(node, add, wikiRevisionDate(node, revision));
    structuredWorkClaims(node, add);
  }
  videoClaims(document, nodes, add);
  claims.push(...documentClaims);
  claims.push(
    ...pageConventionClaims(
      document,
      pageUrl,
      meta,
      observedAt,
      claims.some((claim) => claim.field === "issued"),
      nodes,
    ),
  );
  if (!claims.some((claim) => claim.field === "issued")) {
    add("issued", leadingDateline(document), "html", "leading dateline");
  }
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
  const scholarly = nodes.find((node) =>
    schemaTypes(node).some((type) => scholarlyJsonLdTypes.has(type)),
  );
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
    claims: conventionCreatorRoles(claims),
    observedAt,
    ...(Object.keys(identifiers).length ? { identifiers } : {}),
    ...(pdfUrl ? { pdfUrl } : {}),
  };
}

const challengeTitle =
  /^(?:just a moment[.!…]*|attention required!?|access denied|are you a robot\??|human verification|verify (?:you are|you're) human|(?:error\s*)?403(?:\s*[-:]?\s*forbidden)?)(?:\s*[-|—]\s*.*)?$/iu;

/**
 * A bot wall or interstitial, whose title and tags describe the wall rather than the work. A
 * challenge-like title alone is not enough: real works are titled "Access denied", so any sign
 * of the work itself (scholarly tags, a JSON-LD work, a different og:title or heading) wins.
 */
function challengePage(
  document: Document,
  pageUrl: string,
  meta: MetaIndex,
  nodes: readonly JsonLdNode[],
): boolean {
  const title = textValue(document.title) ?? "";
  const heading = textValue(document.querySelector("h1")?.textContent ?? "");
  const work =
    [...meta.keys()].some(
      (key) => key.startsWith("citation_") || key.startsWith("prism.") || key === "dc.title",
    ) ||
    nodes.some((node) => isWork(node) && (node["headline"] ?? node["name"])) ||
    [meta.get("og:title")?.[0], heading].some(
      (value) => value !== undefined && value !== title && !challengeTitle.test(value),
    );
  if (challengeTitle.test(title)) {
    return !work;
  }
  // Some interstitials expose only the bare host. That is not a work title.
  try {
    const host = new URL(pageUrl).hostname.replace(/^www\./u, "");
    return title.toLowerCase().replace(/^www\./u, "") === host && heading === undefined && !work;
  } catch {
    return false;
  }
}

function videoClaims(document: Document, nodes: readonly JsonLdNode[], add: AddClaim): void {
  const videos = nodes.filter((node) => schemaTypes(node).includes("VideoObject"));
  if (!videos.length) {
    return;
  }
  for (const node of videos) {
    add("issued", cslDate(stringValue(node["uploadDate"])), "json-ld", "uploadDate");
  }
  const authors = [...document.querySelectorAll('[itemprop~="author"][itemscope]')].flatMap(
    videoAuthor,
  );
  add("author", authors, "html", "VideoObject microdata author");
}

function videoAuthor(scope: Element): NonNullable<ReturnType<typeof cslName>>[] {
  const owner = scope.parentElement?.closest("[itemscope]");
  if (
    owner &&
    !owner
      .getAttribute("itemtype")
      ?.split(/\s+/u)
      .some((type) => type.endsWith("/VideoObject"))
  ) {
    return [];
  }
  const property = scope.querySelector('[itemprop~="name"]');
  const name = textValue(property?.getAttribute("content") ?? property?.textContent);
  const author = name && cslName(name);
  return author
    ? [scope.getAttribute("itemtype")?.endsWith("/Organization") ? { literal: name } : author]
    : [];
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
  for (const key of ["citation_type", "dc.type", "dcterms.type"]) {
    for (const value of all(meta, key)) {
      add("type", bibliographicType(value), metaSignal(key), key);
    }
  }
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
    .slice(0, maxMetadataTags)
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
        for (const end of all(meta, lastKey).slice(0, maxValues)) {
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

/**
 * MediaWiki's visible revision footer describes the captured edition, not page creation.
 * Require the standard heading, an ordinary Article/WebPage, and agreement between the
 * footer and structured modification date. A wiki engine alone does not imply encyclopedia.
 */
interface WikiRevision {
  readonly heading: string;
  readonly date: readonly number[];
}

function wikiRevision(document: Document): WikiRevision | undefined {
  const heading = textValue(
    document.querySelector("h1#firstHeading .mw-page-title-main")?.textContent,
  );
  if (!heading) {
    return undefined;
  }
  const footer = textValue(document.querySelector("#footer-info-lastmod")?.textContent);
  const date = /^This page was last edited on (\d{1,2} [A-Za-z]+ \d{4}),/u.exec(footer ?? "")?.[1];
  const parts = cslDate(date)?.["date-parts"][0];
  return parts?.length === 3 ? { heading, date: parts } : undefined;
}

function wikiRevisionDate(
  node: JsonLdNode,
  revision: WikiRevision | undefined,
): string | undefined {
  if (!revision) {
    return undefined;
  }
  const types = schemaTypes(node);
  const name = textValue(stringValue(node["name"]) ?? stringValue(node["headline"]));
  if (
    !types.length ||
    types.some((type) => !["Article", "WebPage"].includes(type)) ||
    name !== revision.heading
  ) {
    return undefined;
  }
  const modified = stringValue(node["dateModified"]);
  const structured = cslDate(modified)?.["date-parts"][0];
  return structured?.length === 3 &&
    revision.date.every((part, index) => part === structured[index])
    ? modified
    : undefined;
}

function linkedClaims(node: JsonLdNode, add: AddClaim, revision?: string): void {
  const signal = "json-ld";
  if (schemaTypes(node).includes("WebSite")) {
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
    for (const value of arrayValue(node[key]).slice(0, maxValues)) {
      // Preserve the node's specificity so a generic WebPage name cannot outvote the work.
      const evidence =
        workType && (key === "headline" || key === "name") ? `${workType} ${key}` : key;
      add(field, stringValue(value), signal, evidence);
    }
  }
  add("author", jsonLdNames(arrayValue(node["author"]).slice(0, maxValues)), signal, "author");
  // For a visibly identified wiki revision, page creation is not this edition's date.
  if (revision) {
    add("issued", cslDate(revision), signal, "MediaWiki revision dateModified");
  } else {
    for (const value of arrayValue(node["datePublished"]).slice(0, maxValues)) {
      add("issued", cslDate(stringValue(value)), signal, "datePublished");
    }
  }
  for (const value of arrayValue(node["publisher"]).slice(0, maxValues)) {
    add("publisher", nameOf(value), signal, "publisher");
  }
  for (const value of arrayValue(node["isPartOf"]).slice(0, maxValues)) {
    add("container-title", linkedContainer(value), signal, "isPartOf");
  }
  const words = arrayValue(node["keywords"])
    .slice(0, maxValues)
    .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
    .map((word) => word.trim())
    .filter(Boolean);
  add("keyword", [...new Set(words)].join(", "), signal, "keywords");
  for (const key of ["identifier", "@id"]) {
    for (const value of arrayValue(node[key]).slice(0, maxValues)) {
      const doi = doiFromText(stringValue(isRecord(value) ? value["value"] : value));
      add("DOI", doi, signal, key);
    }
  }
  for (const type of schemaTypes(node)) {
    linkedType(type, add);
  }
}

function linkedContainer(value: unknown): string | undefined {
  // Article graphs often point to their own WebPage, not the containing publication.
  return isRecord(value) && schemaTypes(value).includes("WebPage") ? undefined : nameOf(value);
}

function specificWorkType(node: JsonLdNode): string | undefined {
  return schemaTypes(node).find(
    (type) =>
      scholarlyJsonLdTypes.has(type) ||
      (articleJsonLdTypes.has(type) && articleJsonLdTypes.get(type) !== "webpage") ||
      linkedWorkTypes.has(type),
  );
}

function linkedType(type: string, add: AddClaim): void {
  const cslType =
    articleJsonLdTypes.get(type) ??
    linkedWorkTypes.get(type) ??
    (scholarlyJsonLdTypes.has(type)
      ? "article-journal"
      : type === "WebPage"
        ? "webpage"
        : undefined);
  add("type", cslType, "json-ld", "@type");
}

function linkedNodes(document: Document, pageUrl: string): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  let characters = 0;
  let scripts = 0;
  const budget = { remaining: maxLinkedNodes };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    characters += script.textContent.length;
    if (++scripts > 32 || characters > maxLinkedCharacters) {
      return [];
    }
    try {
      graphNodes(JSON.parse(script.textContent), nodes, budget);
      if (budget.remaining < 0) {
        return [];
      }
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
      ? value.slice(0, maxValues).map(resolved)
      : isRecord(value) && typeof value["@id"] === "string" && Object.keys(value).length === 1
        ? (byId.get(value["@id"]) ?? value)
        : value;
  return pageWorkNodes(document, pageUrl, nodes)
    .filter((node) => isWork(node) || schemaTypes(node).includes("WebSite"))
    .map((node) => ({
      ...node,
      author: resolved(node["author"]),
      editor: resolved(node["editor"]),
      publisher: resolved(node["publisher"]),
      isPartOf: resolved(node["isPartOf"]),
      partOfSeries: resolved(node["partOfSeries"]),
    }));
}

function graphNodes(
  value: unknown,
  nodes: JsonLdNode[],
  budget: { remaining: number },
  depth = 0,
): void {
  if (value === undefined || depth > 6 || budget.remaining < 0) {
    return;
  }
  if (--budget.remaining < 0) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      graphNodes(item, nodes, budget, depth + 1);
      if (budget.remaining < 0) {
        break;
      }
    }
  } else if (isRecord(value)) {
    nodes.push(value);
    graphNodes(value["@graph"], nodes, budget, depth + 1);
    graphNodes(value["mainEntity"], nodes, budget, depth + 1);
  }
}

/** Recommendations/list entries describe other works, not the page being captured. */
function pageWorkNodes(document: Document, pageUrl: string, nodes: JsonLdNode[]): JsonLdNode[] {
  const identityUrl = (value: unknown): string | undefined => {
    const identity = isRecord(value) ? (value["@id"] ?? value["url"]) : value;
    if (typeof identity !== "string") {
      return undefined;
    }
    try {
      const url = new URL(identity, pageUrl);
      url.hash = "";
      return url.href;
    } catch {
      return undefined;
    }
  };
  const pageUrls = new Set([identityUrl(pageUrl)]);
  for (const link of document.querySelectorAll('link[rel~="canonical"]')) {
    const url = identityUrl(link.getAttribute("href"));
    if (url) {
      pageUrls.add(url);
    }
  }
  const matchesPage = (value: unknown): boolean => {
    const url = identityUrl(value);
    return url !== undefined && pageUrls.has(url);
  };
  const nodeIdentityMatches = (node: JsonLdNode): boolean =>
    arrayValue(node["url"]).some(matchesPage) || matchesPage(node["@id"]);
  const mainEntities = new Set<unknown>();
  for (const node of nodes) {
    if (
      schemaTypes(node).includes("WebPage") &&
      (matchesPage(node["@id"] ?? node["url"]) || (!node["@id"] && !node["url"]))
    ) {
      for (const entity of arrayValue(node["mainEntity"])) {
        mainEntities.add(isRecord(entity) ? (entity["@id"] ?? entity) : entity);
      }
    }
  }
  const pageOnly = (node: JsonLdNode): boolean =>
    schemaTypes(node).includes("WebPage") &&
    !schemaTypes(node).some((type) => type !== "WebPage" && isWork({ "@type": type }));
  const works = nodes.filter((node) => isWork(node) && !pageOnly(node));
  const identified = works.filter(nodeIdentityMatches);
  const targeted = (node: JsonLdNode): boolean =>
    (identified.length <= maxUnscopedWorks && nodeIdentityMatches(node)) ||
    arrayValue(node["mainEntityOfPage"]).some(matchesPage) ||
    mainEntities.has(node["@id"] ?? node);
  const hasTarget = works.some(targeted);
  const listing = nodes.some((node) =>
    schemaTypes(node).some((type) =>
      ["ItemList", "CollectionPage", "SearchResultsPage"].includes(type),
    ),
  );
  return nodes.filter((node) => {
    if (!isWork(node) || targeted(node)) {
      return true;
    }
    // Explicit off-page identities are never evidence for this page. Small anonymous graphs
    // can still express alternate metadata about one work, as publishers commonly do.
    if (
      node["url"] ||
      ((hasTarget || listing || works.length > maxUnscopedWorks) &&
        typeof node["@id"] === "string" &&
        !node["@id"].startsWith("#"))
    ) {
      return false;
    }
    return pageOnly(node) || (!hasTarget && !listing && works.length <= maxUnscopedWorks);
  });
}

function boundedMetaIndex(document: Document): MetaIndex {
  const index = new Map<string, string[]>();
  let count = 0;
  for (const element of document.querySelectorAll<HTMLMetaElement>("meta[name], meta[property]")) {
    if (++count > maxMetadataTags) {
      break;
    }
    const key = (
      element.getAttribute("name") ??
      element.getAttribute("property") ??
      ""
    ).toLowerCase();
    // Qualified DC dates describe different events, not competing publication dates.
    const scheme = element.getAttribute("scheme")?.toLowerCase();
    if (key === "dc.date" && scheme && /^(?:datesubmitted|datemodified|created)$/u.test(scheme)) {
      continue;
    }
    const content = element.content;
    if (key && content && content.length <= maxValueCharacters) {
      const values = index.get(key) ?? [];
      const clean = textValue(content);
      if (values.length < maxValues && clean) {
        values.push(clean);
        index.set(key, values);
      }
    }
  }
  return index;
}

function isWork(node: JsonLdNode): boolean {
  return schemaTypes(node).some(
    (type) =>
      scholarlyJsonLdTypes.has(type) ||
      articleJsonLdTypes.has(type) ||
      linkedWorkTypes.has(type) ||
      type === "WebPage",
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

/** A standalone date at the start of the work, never a date found by scanning prose. */
function leadingDateline(document: Document): ReturnType<typeof cslDate> {
  // Lists and search results do not have one publication dateline.
  if (document.querySelectorAll("article").length > 1) {
    return undefined;
  }
  const root = document.querySelector("article, main") ?? document.body;
  const walker = document.createTreeWalker(root, 4 /* SHOW_TEXT */);
  let visited = 0;
  for (let node = walker.nextNode(); node && ++visited <= 256; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (
      !parent ||
      parent.closest(
        "script, style, noscript, nav, header, footer, aside, h1, [hidden], [aria-hidden='true']",
      )
    ) {
      continue;
    }
    const text = textValue(node.textContent);
    if (!text) {
      continue;
    }
    // A linked archive label, heading, quotation or event time is not a dateline.
    if (parent.closest("a, time, h2, h3, h4, h5, h6, pre, code, blockquote, li, th, caption")) {
      return undefined;
    }
    // English month-name dates only: bare years and numeric prefixes are too easily
    // section labels or data. The line must end here (a BR or a date-only wrapper).
    const standalone =
      node.nextSibling?.nodeName === "BR" || textValue(parent.textContent) === text;
    return standalone && /^[a-z]+\.?\s+(?:\d{1,2},?\s+)?\d{4}$/iu.test(text)
      ? cslDate(text)
      : undefined;
  }
  return undefined;
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

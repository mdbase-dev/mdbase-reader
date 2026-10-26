import { cslDate, cslName } from "./csl-values.js";
import { all, first } from "./meta-tags.js";

import type { Claim } from "./claims.js";
import type { MetaIndex } from "./meta-tags.js";
import type { AddConvention } from "./page-conventions.js";

export function bibliographicConventions(
  document: Document,
  url: URL,
  meta: MetaIndex,
  add: AddConvention,
): void {
  patentClaims(document, url, meta, add);
  gutenbergClaims(document, url, meta, add);
  rfcClaims(document, url, meta, add);
  repecClaims(url, meta, add);
  repositoryClaims(document, url, meta, add);
  legislationClaims(document, url, meta, add);
}

/** RFC head `author` is a creator list; explicit document-header roles disambiguate it. */
export function conventionCreatorRoles(claims: readonly Claim[]): Claim[] {
  const editors = claims.find(
    (claim) =>
      claim.field === "editor" &&
      claim.source.kind === "site-adapter" &&
      claim.source.name === "rfc-editor/document",
  )?.value;
  if (!Array.isArray(editors)) {
    return [...claims];
  }
  const names = new Set(editors.map((name: unknown) => JSON.stringify(name)));
  return claims.flatMap((claim) => {
    if (
      claim.field !== "author" ||
      claim.source.kind !== "page" ||
      claim.evidence !== "author" ||
      !Array.isArray(claim.value)
    ) {
      return [claim];
    }
    const authors = claim.value.filter((name: unknown) => !names.has(JSON.stringify(name)));
    return authors.length ? [{ ...claim, value: authors }] : [];
  });
}

function patentClaims(document: Document, url: URL, meta: MetaIndex, add: AddConvention): void {
  const number = /^\/patent\/([A-Z]{2}\d+[A-Z]\d*)\/[a-z]{2}$/u.exec(url.pathname)?.[1];
  if (
    url.hostname !== "patents.google.com" ||
    !number ||
    first(meta, "dc.type") !== "patent" ||
    document.querySelector('[itemprop="publicationNumber"]')?.textContent.trim() !== number
  ) {
    return;
  }
  add("google-patents/grant", "type", "patent", "patent bibliographic header");
  add("google-patents/grant", "number", number, "publicationNumber agrees with patent route");
  add(
    "google-patents/grant",
    "title",
    first(meta, "dc.title"),
    "DC.title, without SEO patent number",
  );
  const inventors = [...document.querySelectorAll('meta[name="DC.contributor"][scheme="inventor"]')]
    .slice(0, 128)
    .flatMap((element) => {
      const name = cslName(element.getAttribute("content") ?? "");
      return name ? [name] : [];
    });
  add("google-patents/grant", "author", inventors, "DC.contributor scheme=inventor, not assignee");
  const issued = document
    .querySelector('meta[name="DC.date"][scheme="issue"]')
    ?.getAttribute("content");
  add(
    "google-patents/grant",
    "issued",
    cslDate(issued ?? undefined),
    "DC.date scheme=issue, not dateSubmitted",
  );
}

function gutenbergClaims(document: Document, url: URL, meta: MetaIndex, add: AddConvention): void {
  if (
    !/^(?:www\.)?gutenberg\.org$/u.test(url.hostname) ||
    !/^\/ebooks\/\d+\/?$/u.test(url.pathname) ||
    first(meta, "og:site_name") !== "Project Gutenberg"
  ) {
    return;
  }
  const scope = document.querySelector(
    '[itemscope][itemtype="https://schema.org/Book"], [itemscope][itemtype="http://schema.org/Book"]',
  );
  const table = scope?.querySelector("table.bibrec");
  if (!table) {
    return;
  }
  add("gutenberg/ebook", "type", "book", "Book bibliographic record");
  add(
    "gutenberg/ebook",
    "title",
    clean(table.querySelector('[itemprop="headline"]')?.textContent),
    "bibliographic title, not SEO byline",
  );
  const authors = [...table.querySelectorAll('[itemprop="creator"][rel="marcrel:aut"]')]
    .slice(0, 128)
    .flatMap((element) => {
      // Gutenberg authority headings append lifespans; those are not given names.
      const name = cslName(element.textContent.replace(/,\s*\d{3,4}\??\s*-\s*\d{0,4}\??\s*$/u, ""));
      return name ? [name] : [];
    });
  add("gutenberg/ebook", "author", authors, "bibliographic author authority heading");
  add(
    "gutenberg/ebook",
    "publisher",
    clean(scope?.querySelector('[itemprop="publisher"]')?.getAttribute("content")),
    "Book publisher microdata",
  );
  // Some editions invert RDFa issued/modified values. Cite the labelled release row.
  const release = [...table.querySelectorAll("tr")].find(
    (row) => row.querySelector("th")?.textContent.trim() === "Release Date",
  );
  add(
    "gutenberg/ebook",
    "issued",
    cslDate(clean(release?.querySelector('[itemprop="datePublished"]')?.textContent)),
    "Release Date row datePublished",
  );
}

function rfcClaims(document: Document, url: URL, meta: MetaIndex, add: AddConvention): void {
  const number = /^\/rfc\/rfc([1-9]\d*)\.html$/u.exec(url.pathname)?.[1];
  if (
    !/^(?:www\.)?rfc-editor\.org$/u.test(url.hostname) ||
    !number ||
    first(meta, "rfc.number") !== number ||
    clean(document.querySelector("#rfcnum")?.textContent) !== `RFC ${number}`
  ) {
    return;
  }
  add("rfc-editor/document", "type", "report", "RFC number and document header");
  add(
    "rfc-editor/document",
    "title",
    clean(document.querySelector("h1#title")?.textContent),
    "RFC document title",
  );
  add("rfc-editor/document", "number", number, "rfc.number agrees with document header");
  add(
    "rfc-editor/document",
    "issued",
    cslDate(document.querySelector("time.published")?.getAttribute("datetime") ?? undefined),
    "RFC published time",
  );
  add("rfc-editor/document", "publisher", "RFC Editor", "RFC Editor published RFC");
  const rows = [...document.querySelectorAll("dd.authors .author")];
  const names = all(meta, "author");
  // Only pair full names with roles if the ordered document header agrees on surnames.
  if (rows.length !== names.length || rows.length > 128) {
    return;
  }
  const editors = names.flatMap((name, index) => {
    const parsed = cslName(name);
    const row = rows[index];
    return parsed?.family &&
      row?.querySelector(".editor")?.textContent.trim() === "Ed." &&
      row
        .querySelector(".author-name")
        ?.textContent.split(",")[0]
        ?.trim()
        .endsWith(` ${parsed.family}`)
      ? [parsed]
      : [];
  });
  add(
    "rfc-editor/document",
    "editor",
    editors,
    "full author metadata paired with explicit Ed. header roles",
  );
  // A DOI prefix plus the RFC number would be a guess, not a DOI observed on this page.
}

function repecClaims(url: URL, meta: MetaIndex, add: AddConvention): void {
  if (
    url.hostname !== "ideas.repec.org" ||
    !/^\/p\/[a-z0-9_]+\/[a-z0-9_]+\/[a-z0-9_-]+\.html$/u.test(url.pathname) ||
    first(meta, "citation_type") !== "redif-paper" ||
    !first(meta, "citation_technical_report_number")
  ) {
    return;
  }
  add("repec/paper", "type", "report", "ReDIF paper with technical report number");
  const authors = all(meta, "citation_authors")
    .flatMap((value) => value.split(";"))
    .slice(0, 128)
    .flatMap((value) => {
      const name = cslName(value);
      return name ? [name] : [];
    });
  add("repec/paper", "author", authors, "citation_authors list, not concatenated graph byline");
  add(
    "repec/paper",
    "issued",
    cslDate(first(meta, "citation_publication_date")),
    "citation_publication_date, not generic page date",
  );
  add("repec/paper", "URL", url.href, "ReDIF record route, not malformed double-slash OG URL");
  // RePEc's NBER series uses the legal suffix; NBER's bibliographic imprint omits it.
  if (
    url.pathname.startsWith("/p/nbr/nberwo/") &&
    first(meta, "citation_publisher") === "National Bureau of Economic Research, Inc"
  ) {
    add(
      "repec/paper",
      "publisher",
      "National Bureau of Economic Research",
      "NBER working-paper imprint",
    );
  }
}

function repositoryClaims(document: Document, url: URL, meta: MetaIndex, add: AddConvention): void {
  if (
    url.hostname === "arxiv.org" &&
    /^\/abs\/(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/u.test(url.pathname) &&
    first(meta, "citation_arxiv_id")?.replace(/v\d+$/u, "") ===
      url.pathname.slice(5).replace(/v\d+$/u, "") &&
    document.querySelector("h1.title")
  ) {
    add("arxiv/abstract", "publisher", "arXiv", "arXiv abstract with repository identifier");
  }
  if (
    url.hostname === "aclanthology.org" &&
    /^\/[A-Za-z0-9][A-Za-z0-9.-]+\/$/u.test(url.pathname) &&
    first(meta, "og:site_name") === "ACL Anthology" &&
    first(meta, "citation_conference_title") &&
    document.querySelector("#title a[href$='.pdf']")
  ) {
    add(
      "acl-anthology/paper",
      "container-title",
      first(meta, "citation_conference_title"),
      "paper citation_conference_title",
    );
    // Anthology also hosts other societies' proceedings. Only this named ACL event
    // implies the ACL imprint; hosting alone must never imply the publisher.
    if (
      /^Proceedings of the \d+(?:st|nd|rd|th) Annual Meeting of the Association for Computational Linguistics$/u.test(
        first(meta, "citation_conference_title") ?? "",
      )
    ) {
      add(
        "acl-anthology/paper",
        "publisher",
        "Association for Computational Linguistics",
        "ACL Annual Meeting proceedings imprint",
      );
    }
  }
}

function legislationClaims(
  document: Document,
  url: URL,
  meta: MetaIndex,
  add: AddConvention,
): void {
  const act = /^\/ukpga\/(\d{4})\/([1-9]\d*)\/contents\/enacted$/u.exec(url.pathname);
  if (
    !/^(?:www\.)?legislation\.gov\.uk$/u.test(url.hostname) ||
    !act ||
    !document.querySelector("h1#pageTitle") ||
    !first(meta, "dc.title")
  ) {
    return;
  }
  add("legislation/ukpga-enacted", "type", "legislation", "UK Public General Act enacted contents");
  add(
    "legislation/ukpga-enacted",
    "number",
    `${act[1] ?? ""} c. ${act[2] ?? ""}`,
    "UK Public General Act year/chapter route",
  );
  add(
    "legislation/ukpga-enacted",
    "URL",
    url.href,
    "requested enacted edition, not revised canonical",
  );
  // Royal assent day is not encoded by an Act's year/chapter or DC.Date.Modified.
}

function clean(value: string | null | undefined): string | undefined {
  const text = value?.replace(/\s+/gu, " ").trim();
  return text?.length ? text : undefined;
}

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { pageClaims } from "./page-claims.js";

import type { ClaimBatch, PageSignal } from "./claims.js";

const observedAt = "2026-10-21T09:00:00.000Z";
const pageUrl = "https://example.org/story";

function page(head: string, body = "", language = ""): Document {
  return new DOMParser().parseFromString(
    `<html lang="${language}"><head>${head}</head><body>${body}</body></html>`,
    "text/html",
  );
}

function linked(node: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(node)}</script>`;
}

function claim(field: string, value: unknown, signal: PageSignal, evidence: string): unknown {
  return { field, value, source: { kind: "page", signal }, evidence, observedAt };
}

function values(batch: ClaimBatch, field: string): unknown[] {
  return batch.claims.filter((claim) => claim.field === field).map((claim) => claim.value);
}

afterEach(() => vi.restoreAllMocks());

describe("page claims from article signals", () => {
  it("keeps Wikipedia's competing title evidence without reusing its publisher as a container", () => {
    const document = page(
      `<title>Australia - Wikipedia</title>
       <meta property="og:type" content="website">
       <meta property="og:title" content="Australia">
       ${linked({
         "@type": "Article",
         name: "Australia",
         headline: "country",
         author: { "@type": "Organization", name: "Contributors to Wikimedia projects" },
         publisher: { "@type": "Organization", name: "Wikimedia Foundation, Inc." },
         datePublished: "2001-11-04T00:00:00Z",
         dateModified: "2026-10-20T00:00:00Z",
         inLanguage: "en",
       })}`,
      "<main><h1>Australia</h1></main>",
      "en",
    );
    const result = pageClaims(document, "https://en.wikipedia.org/wiki/Australia", observedAt);
    expect(result.claims).toEqual(
      expect.arrayContaining([
        claim("title", "country", "json-ld", "headline"),
        claim("title", "Australia", "json-ld", "name"),
        claim("title", "Australia - Wikipedia", "html", "title"),
        claim("title", "Australia", "html", "h1"),
        claim("title", "Australia", "open-graph", "og:title"),
        claim("publisher", "Wikimedia Foundation, Inc.", "json-ld", "publisher"),
        claim("author", [{ literal: "Contributors to Wikimedia projects" }], "json-ld", "author"),
        claim("issued", { "date-parts": [[2001, 11, 4]] }, "json-ld", "datePublished"),
        claim("type", "webpage", "open-graph", "og:type"),
      ]),
    );
    expect(values(result, "container-title")).toEqual([]);
    expect(values(result, "issued")).toEqual([{ "date-parts": [[2001, 11, 4]] }]);
    expect(result.claims.every((entry) => entry.observedAt === observedAt)).toBe(true);
  });

  it("reports both Guardian bylines, retaining cslName's unfiltered role-name split", () => {
    const document = page(`
      <meta property="article:author" content="Associated Press">
      ${linked({
        "@type": "NewsArticle",
        headline: "A new walking route opens",
        author: { "@type": "Person", name: "Guardian staff reporter" },
        publisher: { "@type": "Organization", name: "Guardian News & Media" },
      })}`);
    const result = pageClaims(document, pageUrl, observedAt);
    expect(result.claims).toEqual(
      expect.arrayContaining([
        claim("author", [{ family: "reporter", given: "Guardian staff" }], "json-ld", "author"),
        claim("author", [{ family: "Press", given: "Associated" }], "open-graph", "article:author"),
        claim("type", "article-newspaper", "json-ld", "@type"),
      ]),
    );
    expect(values(result, "container-title")).toEqual([]);
  });
});

describe("page claims from tags and HTML", () => {
  it("reports every Highwire and PRISM candidate with DOI and PDF discovery", () => {
    const document = page(`
      <meta name="citation_title" content="Measuring small signals">
      <meta name="citation_title" content="Measuring small signals: revised">
      <meta name="citation_author" content="Example, Jane">
      <meta name="citation_author" content="Sam Researcher">
      <meta name="citation_publication_date" content="2024/03/02">
      <meta name="citation_date" content="2024-03">
      <meta name="citation_journal_title" content="Journal of Examples">
      <meta name="prism.publicationName" content="Examples Quarterly">
      <meta name="citation_volume" content="12">
      <meta name="citation_issue" content="3">
      <meta name="citation_firstpage" content="11">
      <meta name="citation_lastpage" content="19">
      <meta name="citation_doi" content="doi:10.1234/signals.2024">
      <meta name="citation_pdf_url" content="/papers/signals.pdf">
      <meta name="citation_isbn" content="9781234567897">
      <meta name="citation_pmid" content="12345678">`);
    const result = pageClaims(document, pageUrl, observedAt);
    expect(result.claims).toEqual(
      expect.arrayContaining([
        claim("title", "Measuring small signals", "highwire", "citation_title"),
        claim("title", "Measuring small signals: revised", "highwire", "citation_title"),
        claim("container-title", "Journal of Examples", "highwire", "citation_journal_title"),
        claim("container-title", "Examples Quarterly", "highwire", "prism.publicationname"),
        claim("issued", { "date-parts": [[2024, 3, 2]] }, "highwire", "citation_publication_date"),
        claim("issued", { "date-parts": [[2024, 3]] }, "highwire", "citation_date"),
        claim("page", "11-19", "highwire", "citation_firstpage + citation_lastpage"),
        claim("type", "article-journal", "highwire", "citation_journal_title"),
        claim("type", "book", "highwire", "citation_isbn"),
      ]),
    );
    expect(values(result, "author")).toEqual([
      [
        { family: "Example", given: "Jane" },
        { family: "Researcher", given: "Sam" },
      ],
    ]);
    expect(result.identifiers).toEqual({
      doi: "10.1234/signals.2024",
      isbn: "9781234567897",
      pmid: "12345678",
    });
    expect(result.pdfUrl).toBe("https://example.org/papers/signals.pdf");
  });

  it("reports Open Graph and Twitter alternatives on an og-only blog post", () => {
    const result = pageClaims(
      page(`
        <meta property="og:type" content="article">
        <meta property="og:title" content="An afternoon experiment">
        <meta name="twitter:title" content="An experiment, recorded">
        <meta property="og:site_name" content="Field Notes">
        <meta property="og:locale" content="en_AU">
        <meta property="og:description" content="A compact experiment.">
        <meta name="twitter:description" content="An alternative summary.">
        <meta property="article:published_time" content="2024-02-05T10:00:00Z">
        <meta property="article:author" content="Alex Marin">
        <meta property="article:tag" content="experiments">
        <meta property="article:tag" content="notes">`),
      pageUrl,
      observedAt,
    );
    expect(result.claims).toEqual(
      expect.arrayContaining([
        claim("title", "An afternoon experiment", "open-graph", "og:title"),
        claim("title", "An experiment, recorded", "open-graph", "twitter:title"),
        claim("abstract", "A compact experiment.", "open-graph", "og:description"),
        claim("abstract", "An alternative summary.", "open-graph", "twitter:description"),
        claim("container-title", "Field Notes", "open-graph", "og:site_name"),
        claim("language", "en-AU", "open-graph", "og:locale"),
        claim("issued", { "date-parts": [[2024, 2, 5]] }, "open-graph", "article:published_time"),
        claim("keyword", "experiments, notes", "open-graph", "article:tag"),
      ]),
    );
    expect(result.identifiers).toBeUndefined();
  });

  it("uses only HTML evidence on a page with no metadata, without network or DOM mutations", () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network"));
    const document = page(
      '<title>Plain notes</title><link rel="canonical" href="/notes">',
      "<main><h1>Notes from a small experiment</h1></main>",
      "en-GB",
    );
    const before = document.documentElement.outerHTML;
    expect(pageClaims(document, pageUrl, observedAt)).toEqual({
      observedAt,
      claims: [
        claim("title", "Plain notes", "html", "title"),
        claim("title", "Notes from a small experiment", "html", "h1"),
        claim("URL", "https://example.org/notes", "html", "canonical"),
        claim("language", "en-GB", "html", "html lang"),
        claim("URL", pageUrl, "html", "page URL"),
        claim("type", "webpage", "html", "document"),
      ],
    });
    expect(document.documentElement.outerHTML).toBe(before);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

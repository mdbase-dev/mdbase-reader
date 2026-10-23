// @vitest-environment happy-dom
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { pageClaims } from "./page-claims.js";
import { extractScholarlyMetadata } from "./scholarly-metadata.js";

const observedAt = "2026-10-21T09:00:00.000Z";

function linked(node: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(node)}</script>`;
}

// Metadata from the existing scholarly and web-article tests, not article text.
const fixtures = [
  {
    name: "Highwire journal article",
    url: "https://www.nature.com/articles/171737a0",
    head: `
      <meta name="citation_title" content="Molecular structure of nucleic acids">
      <meta name="citation_author" content="Watson, James D.">
      <meta name="citation_author" content="Francis Crick">
      <meta name="citation_publication_date" content="1953/04/25">
      <meta name="citation_journal_title" content="Nature">
      <meta name="citation_volume" content="171">
      <meta name="citation_issue" content="4356">
      <meta name="citation_firstpage" content="737">
      <meta name="citation_lastpage" content="738">
      <meta name="citation_doi" content="doi:10.1038/171737a0">
      <meta name="citation_pdf_url" content="/articles/171737a0.pdf">`,
  },
  {
    name: "plain Dublin Core page",
    url: "https://blog.example/post",
    head: '<meta name="DC.title" content="A blog post">',
  },
  {
    name: "identified Dublin Core page",
    url: "https://repo.example/1",
    head: `
      <meta name="DC.title" content="Thesis title">
      <meta name="DC.creator" content="Ada Lovelace">
      <meta name="DC.identifier" content="https://doi.org/10.5555/abc.123">`,
  },
  {
    name: "mixed Dublin Core creator namespaces",
    url: "https://repo.example/2",
    head: `
      <meta name="DC.title" content="A shared record">
      <meta name="DC.creator" content="Ada Example">
      <meta name="dcterms.creator" content="Sam Example">
      <meta name="DC.identifier" content="doi:10.5555/shared">`,
  },
  {
    name: "scholarly JSON-LD graph",
    url: "https://example.org/a",
    head: linked({
      "@graph": [
        { "@type": "WebPage", name: "ignored" },
        {
          "@type": "ScholarlyArticle",
          headline: "Graph article",
          author: [{ "@type": "Person", givenName: "Grace", familyName: "Hopper" }],
          datePublished: "1952-05-01",
          isPartOf: { "@type": "Periodical", name: "Journal of Examples" },
        },
      ],
    }),
  },
  { name: "arXiv page", url: "https://arxiv.org/abs/0704.0001v2", head: "" },
  {
    name: "ordinary Open Graph page",
    url: "https://news.example/story",
    head: '<meta property="og:title" content="News">',
  },
  {
    name: "news JSON-LD graph with references",
    url: "https://news.example/rivers",
    head: `
      <meta property="og:site_name" content="The Daily Example">
      <meta property="og:title" content="Rivers rise | The Daily Example">
      ${linked({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebPage", "@id": "https://news.example/rivers#page", name: "Rivers rise" },
          {
            "@type": "NewsArticle",
            headline: "Rivers rise after record rain",
            isPartOf: { "@id": "https://news.example/rivers#page" },
            author: [
              { "@id": "https://news.example/#jane" },
              { "@type": "Organization", name: "Example Wire" },
            ],
            publisher: { "@id": "https://news.example/#org" },
            datePublished: "2024-03-02T08:15:00Z",
            articleSection: "Environment",
            keywords: ["floods", "weather"],
            inLanguage: "en-GB",
            description: "Flood warnings across the valley.",
          },
          { "@type": "Person", "@id": "https://news.example/#jane", name: "Jane Doe" },
          {
            "@type": "NewsMediaOrganization",
            "@id": "https://news.example/#org",
            name: "Example Media Ltd",
          },
        ],
      })}`,
  },
  {
    name: "blog JSON-LD",
    url: "https://blog.example/notes",
    head: linked({
      "@type": "BlogPosting",
      headline: "Notes on reading",
      author: { "@type": "Person", name: "Sam Writer" },
      datePublished: "2023-11-05",
    }),
  },
  {
    name: "Open Graph article with a profile URL author",
    url: "https://sea.example/tides",
    head: `
      <meta property="og:type" content="article">
      <meta property="og:title" content="How tides work">
      <meta property="og:site_name" content="Sea Notes">
      <meta property="og:locale" content="en_AU">
      <meta property="og:description" content="A short explainer.">
      <meta property="article:published_time" content="2022-07-19T10:00:00+10:00">
      <meta property="article:author" content="https://facebook.com/seanotes">
      <meta name="author" content="Alex Marin">
      <meta property="article:tag" content="tides">`,
  },
];

function expectLegacyFields(document: Document, url: string): void {
  const legacy = extractScholarlyMetadata(document, url);
  const batch = pageClaims(document, url, observedAt);
  for (const [field, value] of Object.entries(legacy.citation ?? {})) {
    expect(
      batch.claims.filter((claim) => claim.field === field).map((claim) => claim.value),
      field,
    ).toContainEqual(value);
  }
  if (legacy.doi) {
    expect(batch.identifiers?.doi).toBe(legacy.doi);
  }
  if (legacy.pdfUrl) {
    expect(batch.pdfUrl).toBe(legacy.pdfUrl);
  }
}

describe("page claims preserve existing extractor evidence", () => {
  it.each(fixtures)("includes every legacy field from $name", ({ head, url }) => {
    const document = new DOMParser().parseFromString(
      `<html><head>${head}</head><body></body></html>`,
      "text/html",
    );
    expectLegacyFields(document, url);
  });

  it.each(["academic", "encyclopedia", "code-guide"])(
    "includes every legacy field from the %s capture fixture",
    (name) => {
      const html = readFileSync(`src/fixtures/${name}.html`, "utf8");
      const document = new DOMParser().parseFromString(html, "text/html");
      expectLegacyFields(document, `https://example.org/${name}`);
    },
  );
});

// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { jsonLdNames, jsonLdNode, nameOf, resolveJsonLdReferences } from "./json-ld.js";
import { pageClaims } from "./page-claims.js";
import { resolveCitation } from "./resolver.js";

const observedAt = "2026-10-21T09:00:00.000Z";
const pageUrl = "https://example.org/notes";

function page(head: string, body = ""): Document {
  return new DOMParser().parseFromString(
    `<html><head>${head}</head><body>${body}</body></html>`,
    "text/html",
  );
}

function linked(node: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(node)}</script>`;
}

function values(document: Document, field: string): unknown[] {
  return pageClaims(document, pageUrl, observedAt)
    .claims.filter((claim) => claim.field === field)
    .map((claim) => claim.value);
}

describe("bounded JSON-LD values", () => {
  it.each(["publisher", "author", "isPartOf"])(
    "bounds recursion inside JSON-LD %s values without aborting extraction",
    (field) => {
      const nested =
        field === "author"
          ? "[".repeat(12_000) + '"Jane Doe"' + "]".repeat(12_000)
          : '{"isPartOf":'.repeat(12_000) + '{"name":"Deep publisher"}' + "}".repeat(12_000);
      const document = page(`<title>Work</title><script type="application/ld+json">{
        "@type":"NewsArticle", "headline":"Work", "${field}":${nested}
      }</script>`);
      const batch = pageClaims(document, pageUrl, observedAt);
      expect(resolveCitation({ claims: batch.claims }).citation?.["title"]).toBe("Work");
      expect(
        batch.claims.some(
          (claim) =>
            claim.field === field || (field === "isPartOf" && claim.field === "container-title"),
        ),
      ).toBe(false);
      // The shared/legacy JSON-LD entry point must enforce the same traversal bounds.
      const node = jsonLdNode(document, (type) => type === "NewsArticle");
      expect(node?.["headline"]).toBe("Work");
      expect(jsonLdNames(node?.["author"])).toEqual([]);
      expect(nameOf(node?.[field])).toBeUndefined();
    },
  );

  it("bounds work across wide nested JSON-LD arrays and keeps other fields", () => {
    const references = new Map([["#author", { name: "Jane Doe" }]]);
    const budget = { remaining: 4_096 };
    const author = Array.from({ length: 128 }, () =>
      Array.from({ length: 128 }, () => ({ "@id": "#author" })),
    );
    resolveJsonLdReferences(author, references, budget);
    expect(budget.remaining).toBe(0);
    const document = page(
      linked({
        "@type": "NewsArticle",
        headline: "Work",
        author,
        publisher: { name: "Valid publisher" },
      }),
    );
    expect(values(document, "publisher")).toEqual(["Valid publisher"]);
  });

  it("keeps ordinary nested publication names and ignores cyclic name paths", () => {
    expect(nameOf({ isPartOf: { isPartOf: { name: "Journal" } } })).toBe("Journal");
    const cycle: Record<string, unknown> = {};
    cycle["isPartOf"] = cycle;
    expect(nameOf(cycle)).toBeUndefined();
  });
});

describe("JSON-LD page identities", () => {
  it.each(["@id", "url"])("rejects an explicitly off-page %s even in a small graph", (identity) => {
    const document = page(
      `<title>Current work</title>${linked({
        "@type": "NewsArticle",
        [identity]: "https://other.example/recommended",
        headline: "Recommended work",
        identifier: "10.1234/unrelated",
      })}`,
    );
    const batch = pageClaims(document, pageUrl, observedAt);
    expect(batch.identifiers?.doi).toBeUndefined();
    expect(resolveCitation({ claims: batch.claims }).citation?.["title"]).toBe("Current work");
  });

  it.each([
    "https://example.org/notes",
    "http://example.org/notes",
    "https://www.example.org/notes/",
    "https://example.org/notes#article",
    "#article",
  ])("accepts the same-page identity %s", (id) => {
    const document = page(linked({ "@type": "NewsArticle", "@id": id, headline: "Work" }));
    expect(values(document, "title")).toEqual(["Work"]);
  });

  it.each(["https://example.org/notes/amp", "https://example.org/notes?amp=1"])(
    "accepts canonical-page identities when capturing %s",
    (url) => {
      const document = page(
        `<link rel="canonical" href="https://example.org/notes">${linked({
          "@type": "NewsArticle",
          "@id": "http://www.example.org/notes/#article",
          headline: "Canonical work",
        })}`,
      );
      expect(pageClaims(document, url, observedAt).claims).toContainEqual(
        expect.objectContaining({ field: "title", value: "Canonical work" }),
      );
    },
  );

  it.each(["mainEntity", "mainEntityOfPage", "url"])(
    "accepts an off-page identity corroborated by %s",
    (relationship) => {
      const work = {
        "@type": "NewsArticle",
        "@id": "https://other.example/work",
        headline: "Corroborated work",
        identifier: "10.1234/work",
        ...(relationship === "mainEntityOfPage" ? { mainEntityOfPage: { "@id": pageUrl } } : {}),
        ...(relationship === "url" ? { url: pageUrl } : {}),
      };
      const document = page(
        linked({
          "@graph": [
            work,
            ...(relationship === "mainEntity"
              ? [{ "@type": "WebPage", "@id": pageUrl, mainEntity: { "@id": work["@id"] } }]
              : []),
          ],
        }),
      );
      const batch = pageClaims(document, pageUrl, observedAt);
      expect(batch.identifiers?.doi).toBe("10.1234/work");
      expect(resolveCitation({ claims: batch.claims }).citation?.["title"]).toBe(
        "Corroborated work",
      );
    },
  );
});

describe("JSON-LD candidates", () => {
  it("reads every work in graphs, arrays and scripts, resolving references across scripts", () => {
    const document = page(`
      <script type="application/ld+json">not valid JSON</script>
      ${linked({
        "@graph": [
          {
            "@type": ["Article", "NewsArticle"],
            headline: ["An early headline", "A later headline"],
            name: "The work's name",
            alternativeHeadline: "A subtitle",
            author: [
              { "@id": "#person" },
              { "@type": "Organization", name: "Example Group" },
              "Lovelace, Ada",
            ],
            publisher: { "@id": "#publisher" },
            isPartOf: [{ "@id": "#journal" }, { name: "A second journal" }],
            datePublished: ["2024-06", "2025"],
            dateModified: "2026-10-20",
            inLanguage: "en-NZ",
            description: "An original metadata summary.",
            keywords: ["graphs, evidence", "metadata", "graphs"],
          },
          { "@type": "WebPage", name: "A generic page name" },
          { "@type": "Organization", name: "Not a work title" },
        ],
      })}
      ${linked([
        { "@type": "Book", name: "A separate book", isbn: "9781234567897" },
        { "@type": "Person", "@id": "#person", givenName: "Grace", familyName: "Hopper" },
        { "@type": "Organization", "@id": "#publisher", name: "Example Press" },
        { "@type": "Periodical", "@id": "#journal", name: "Graph Journal" },
      ])}`);
    expect(values(document, "title")).toEqual([
      "An early headline",
      "A later headline",
      "The work's name",
      "A subtitle",
      "A generic page name",
      "A separate book",
    ]);
    expect(values(document, "author")).toEqual([
      [
        { family: "Hopper", given: "Grace" },
        { literal: "Example Group" },
        { family: "Lovelace", given: "Ada" },
      ],
    ]);
    expect(values(document, "publisher")).toEqual(["Example Press"]);
    expect(values(document, "container-title")).toEqual(["Graph Journal", "A second journal"]);
    expect(values(document, "issued")).toEqual([
      { "date-parts": [[2024, 6]] },
      { "date-parts": [[2025]] },
    ]);
    expect(values(document, "keyword")).toEqual(["graphs, evidence, metadata"]);
    expect(values(document, "abstract")).toEqual(["An original metadata summary."]);
    expect(values(document, "language")).toEqual(["en-NZ"]);
    expect(values(document, "ISBN")).toEqual(["9781234567897"]);
    expect(values(document, "type")).toEqual(
      expect.arrayContaining(["webpage", "article-newspaper", "book"]),
    );
  });

  it("ignores unknown types, including object prototype names", () => {
    const document = page(linked({ "@type": ["Article", "constructor", "toString", "__proto__"] }));
    expect(values(document, "type")).toEqual(["webpage", "webpage"]);
  });

  it("never substitutes dateModified for a missing publication date", () => {
    const document = page(
      linked({ "@type": "WebPage", name: "A living document", dateModified: "2026-10-20" }),
    );
    expect(values(document, "issued")).toEqual([]);
  });
});

it.each([
  ["ScholarlyArticle", "article-journal"],
  ["MedicalScholarlyArticle", "article-journal"],
  ["Book", "book"],
  ["Chapter", "chapter"],
  ["Thesis", "thesis"],
  ["Report", "report"],
  ["Dataset", "dataset"],
  ["NewsArticle", "article-newspaper"],
  ["AnalysisNewsArticle", "article-newspaper"],
  ["BackgroundNewsArticle", "article-newspaper"],
  ["OpinionNewsArticle", "article-newspaper"],
  ["ReportageNewsArticle", "article-newspaper"],
  ["ReviewNewsArticle", "article-newspaper"],
  ["BlogPosting", "post-weblog"],
  ["LiveBlogPosting", "post-weblog"],
  ["SocialMediaPosting", "post"],
  ["DiscussionForumPosting", "post"],
  ["Article", "webpage"],
  ["TechArticle", "webpage"],
  ["AdvertiserContentArticle", "webpage"],
  ["SatiricalArticle", "webpage"],
  ["WebPage", "webpage"],
])("reports a %s type candidate as %s", (type, expected) => {
  const document = page(linked({ "@type": type, name: "A work" }));
  expect(values(document, "type")).toContain(expected);
});

const metaCandidates = [
  ["dc.title", "title", "An alternate title"],
  ["dcterms.title", "title", "Another alternate title"],
  ["citation_journal_abbrev", "container-title-short", "J. Examples"],
  ["citation_series_title", "collection-title", "Evidence Studies"],
  ["citation_conference_title", "container-title", "Examples Conference"],
  ["citation_inbook_title", "container-title", "Collected Examples"],
  ["citation_book_title", "container-title", "A Book of Examples"],
  ["citation_publisher", "publisher", "Example Press"],
  ["citation_dissertation_institution", "publisher", "Example University"],
  ["citation_technical_report_institution", "publisher", "Example Institute"],
  ["dc.publisher", "publisher", "Another Press"],
  ["dcterms.publisher", "publisher", "Yet Another Press"],
  ["prism.volume", "volume", "7"],
  ["prism.number", "issue", "2"],
  ["citation_technical_report_number", "number", "EX-42"],
  ["citation_issn", "ISSN", "1234-5678"],
  ["prism.issn", "ISSN", "9876-5432"],
  ["citation_abstract", "abstract", "A Highwire summary."],
  ["dcterms.abstract", "abstract", "A Dublin Core abstract."],
  ["dc.description", "abstract", "A Dublin Core description."],
  ["dcterms.description", "abstract", "Another Dublin Core description."],
  ["description", "abstract", "A plain HTML summary."],
  ["citation_language", "language", "en"],
  ["dc.language", "language", "fr"],
  ["dcterms.language", "language", "de"],
  ["article:section", "section", "Science"],
] as const;

it("keeps all embedded scalar fields, regardless of competing signals", () => {
  const document = page(
    metaCandidates.map(([key, , value]) => `<meta name="${key}" content="${value}">`).join(""),
  );
  const batch = pageClaims(document, pageUrl, observedAt);
  for (const [key, field, value] of metaCandidates) {
    expect(batch.claims).toContainEqual(
      expect.objectContaining({ field, value, evidence: key, observedAt }),
    );
  }
  expect(values(document, "type")).toEqual(
    expect.arrayContaining(["thesis", "report", "paper-conference", "chapter"]),
  );
});

it.each([
  "citation_cover_date",
  "prism.publicationdate",
  "prism.coverdate",
  "citation_online_date",
  "dcterms.issued",
  "dc.date",
  "citation_year",
  "date",
])("keeps the %s date candidate", (key) => {
  const document = page(`<meta name="${key}" content="2024-06-03">`);
  expect(values(document, "issued")).toContainEqual({ "date-parts": [[2024, 6, 3]] });
});

it("keeps complete name lists from each metadata vocabulary and normalizes keywords", () => {
  const document = page(`
    <meta name="citation_author" content="Example, Jane">
    <meta name="citation_authors" content="Sam Researcher; Ada Example">
    <meta name="DC.creator" content="Chris Example">
    <meta name="DC.creator" content="Robin Example">
    <meta name="dcterms.creator" content="Taylor Example">
    <meta name="author" content="Display Byline">
    <meta name="twitter:creator" content="Social Byline">
    <meta name="citation_keywords" content=" evidence; graphs, metadata ">
    <meta name="DC.subject" content="records; data">
    <meta name="dcterms.subject" content="notes">
    <meta name="keywords" content="claims, citations">`);
  const batch = pageClaims(document, pageUrl, observedAt);
  expect(batch.claims).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        field: "author",
        value: [
          { family: "Example", given: "Chris" },
          { family: "Example", given: "Robin" },
        ],
        source: { kind: "page", signal: "dublin-core" },
        evidence: "dc.creator",
      }),
      expect.objectContaining({
        field: "author",
        value: [
          { family: "Researcher", given: "Sam" },
          { family: "Example", given: "Ada" },
        ],
        evidence: "citation_authors",
      }),
      expect.objectContaining({
        field: "author",
        value: [
          { family: "Example", given: "Jane" },
          { family: "Researcher", given: "Sam" },
          { family: "Example", given: "Ada" },
        ],
        evidence: "citation_author + citation_authors",
      }),
    ]),
  );
  expect(values(document, "keyword")).toEqual([
    "evidence, graphs, metadata",
    "records, data",
    "notes",
    "claims, citations",
  ]);
});

it("keeps every DOI candidate while using the existing singleton identifier discovery", () => {
  const document = page(`
    <meta name="citation_doi" content="10.1234/highwire">
    <meta name="prism.doi" content="https://doi.org/10.1234/prism">
    <meta name="DC.identifier" content="doi:10.1234/core">
    <meta name="dcterms.identifier" content="10.1234/terms">
    <meta name="citation_arxiv_id" content="arXiv:2101.00001v3">
    ${linked({
      "@type": "ScholarlyArticle",
      identifier: ["10.1234/linked", { "@type": "PropertyValue", value: "doi:10.1234/property" }],
      "@id": "https://doi.org/10.1234/node",
      mainEntityOfPage: "https://example.org/doi/10.1234/url",
    })}`);
  const batch = pageClaims(document, "https://example.org/doi/10.1234/url", observedAt);
  expect(batch.claims.filter((claim) => claim.field === "DOI").map((claim) => claim.value)).toEqual(
    expect.arrayContaining([
      "10.1234/highwire",
      "10.1234/prism",
      "10.1234/core",
      "10.1234/terms",
      "10.1234/linked",
      "10.1234/property",
      "10.1234/node",
      "10.1234/url",
      "10.48550/arXiv.2101.00001",
    ]),
  );
  expect(batch.identifiers).toEqual({ doi: "10.1234/highwire", arxiv: "2101.00001v3" });
});

it.each(["abs/2101.00001v2", "pdf/2101.00001v2.pdf", "html/2101.00001v2"])(
  "discovers identifiers on arXiv %s URLs",
  (path) => {
    expect(pageClaims(page(""), `https://arxiv.org/${path}`, observedAt).identifiers).toEqual({
      doi: "10.48550/arXiv.2101.00001",
      arxiv: "2101.00001v2",
    });
  },
);

it.each([
  "http://example.org/paper.pdf",
  "javascript:alert(1)",
  "ftp://example.org/paper.pdf",
  "https://[broken",
])("does not expose a non-HTTPS PDF URL: %s", (url) => {
  const document = page(`<meta name="citation_pdf_url" content="${url}">`);
  expect(pageClaims(document, pageUrl, observedAt).pdfUrl).toBeUndefined();
});

it.each([" - ", " | ", " — ", " · "])(
  "leaves the title with separator %s intact for the resolver",
  (separator) => {
    const document = page(`<title>Notes - An experiment${separator}Example Site</title>`);
    expect(values(document, "title")).toEqual([`Notes - An experiment${separator}Example Site`]);
    expect(values(document, "container-title")).toEqual([]);
  },
);

it.each([
  ["<h1>A single heading</h1>", ["A single heading"]],
  ["<h1>A heading</h1><h1>Another heading</h1>", []],
  ["<h1>Navigation</h1><main><h1>Main heading</h1><h1>Later heading</h1></main>", ["Main heading"]],
  ["<h1>Navigation</h1><article><h1>Article heading</h1></article>", ["Article heading"]],
] as const)("reports an unambiguous or main/article h1 from %s", (body, expected) => {
  expect(values(page("", body), "title")).toEqual(expected);
});

it("reports every canonical and metadata URL against the supplied page URL", () => {
  const document = page(`
    <link rel="alternate canonical" href="/canonical">
    <link rel="canonical" href="/another-canonical">
    <link rel="canonical" href="javascript:alert(1)">
    <meta name="citation_public_url" content="/public">
    <meta name="citation_abstract_html_url" content="/abstract">
    <meta property="og:url" content="/open-graph">
    <meta name="twitter:url" content="/twitter">`);
  expect(values(document, "URL")).toEqual([
    "https://example.org/public",
    "https://example.org/abstract",
    "https://example.org/open-graph",
    "https://example.org/twitter",
    "https://example.org/canonical",
    "https://example.org/another-canonical",
    pageUrl,
  ]);
});

it("omits empty and malformed values on an otherwise empty document", () => {
  const document = page(`
    <title> </title>
    <meta name="citation_title" content=" ">
    <meta name="citation_date" content="not a date">
    <meta name="citation_author" content=" ">
    <script type="application/ld+json">null</script>
    ${linked({ "@type": "Article", name: " ", author: [null, 42, {}], datePublished: "unknown" })}`);
  const batch = pageClaims(document, pageUrl, observedAt);
  expect(values(document, "title")).toEqual([]);
  expect(values(document, "author")).toEqual([]);
  expect(values(document, "issued")).toEqual([]);
  expect(batch.claims.every((claim) => claim.value !== undefined && claim.evidence)).toBe(true);
});

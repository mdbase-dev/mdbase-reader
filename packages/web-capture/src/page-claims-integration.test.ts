// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { cslName } from "./csl-values.js";
import { pageClaims } from "./page-claims.js";
import { zoteroItemClaims } from "./provider-claims.js";
import { resolveCitation } from "./resolver.js";
import { extractScholarlyMetadata } from "./scholarly-metadata.js";

const observedAt = "2026-10-21T09:00:00.000Z";
const url = "https://example.org/article";

function page(head: string, body = ""): Document {
  return new DOMParser().parseFromString(
    `<html><head>${head}</head><body>${body}</body></html>`,
    "text/html",
  );
}

function linked(node: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(node)}</script>`;
}

function resolve(document: Document): ReturnType<typeof resolveCitation> {
  return resolveCitation({ claims: pageClaims(document, url, observedAt).claims });
}

describe("page claims through the resolver", () => {
  it("resolves Wikipedia together with a real converted Citoid encyclopedia item", () => {
    const pageUrl = "https://en.wikipedia.org/wiki/Australia";
    const revisionUrl = "https://en.wikipedia.org/w/index.php?title=Australia&oldid=1355000000";
    const document = page(
      `<title>Australia - Wikipedia</title><meta property="og:title" content="Australia">
       <meta property="og:type" content="website">
       ${linked({
         "@type": "Article",
         name: "Australia",
         headline: "country",
         datePublished: "2001-11-04",
         dateModified: "2026-10-20",
         author: { "@type": "Organization", name: "Contributors to Wikimedia projects" },
         publisher: { "@type": "Organization", name: "Wikimedia Foundation, Inc." },
       })}`,
      "<main><h1>Australia</h1></main>",
    );
    const batch = pageClaims(document, pageUrl, observedAt);
    expect(resolveCitation({ claims: batch.claims }).citation).toMatchObject({
      title: "Australia",
      "container-title": "Wikipedia",
      issued: { "date-parts": [[2001, 11, 4]] },
    });
    const claims = [
      ...batch.claims,
      ...zoteroItemClaims(
        {
          itemType: "encyclopediaArticle",
          title: "Australia",
          encyclopediaTitle: "Wikipedia",
          date: "2026-10-20",
          url: revisionUrl,
        },
        observedAt,
      ),
    ];
    const expected = {
      title: "Australia",
      "container-title": "Wikipedia",
      type: "entry-encyclopedia",
      issued: { "date-parts": [[2026, 10, 20]] },
      URL: revisionUrl,
    };
    expect(resolveCitation({ claims }).citation).toMatchObject(expected);
    expect(resolveCitation({ claims: [...claims].reverse() }).citation).toMatchObject(expected);
  });
});

describe("work-specific publisher imprints", () => {
  it("reads a WebPage mainEntity and prefers its corroborated imprint to a registry member", () => {
    const document = page(`<title>Work</title><meta name="citation_publisher" content="Example US">
      <meta name="dc.publisher" content="Example">${linked({
        "@type": "WebPage",
        mainEntity: {
          "@type": "ScholarlyArticle",
          headline: "Work",
          publisher: { "@type": "Organization", name: "Example US" },
        },
      })}`);
    const result = resolveCitation({
      claims: [
        ...pageClaims(document, url, observedAt).claims,
        {
          field: "publisher",
          value: "Example Science and Business Media LLC",
          source: { kind: "registry", name: "doi.org" },
          observedAt,
        },
      ],
    });
    expect(result.citation?.["publisher"]).toBe("Example US");
    expect(result.provenance["publisher"]?.agreed).toContain("page:json-ld publisher");
  });

  it("does not let an uncorroborated generic page publisher override the registry", () => {
    const result = resolveCitation({
      claims: [
        ...pageClaims(
          page('<title>Work</title><meta name="citation_publisher" content="An imprint">'),
          url,
          observedAt,
        ).claims,
        {
          field: "publisher",
          value: "Registry Publisher",
          source: { kind: "registry", name: "doi.org" },
          observedAt,
        },
      ],
    });
    expect(result.citation?.["publisher"]).toBe("Registry Publisher");
  });
});

describe("specific page work types", () => {
  it.each([
    "NewsArticle",
    "ReportageNewsArticle",
    "BlogPosting",
    "ScholarlyArticle",
    "MedicalScholarlyArticle",
  ])(
    "prefers the specific %s type over corroborated defaults and generic remote results",
    (type) => {
      const document = page(
        `<meta property="og:type" content="article">${linked({
          "@graph": [
            { "@type": "WebPage", name: "A generic title" },
            { "@type": ["Article", type], headline: "The full work title" },
          ],
        })}`,
      );
      const batch = pageClaims(document, url, observedAt);
      const claims = [
        ...batch.claims,
        ...zoteroItemClaims({ itemType: "webpage", title: "The full work title" }, observedAt),
      ];
      const expected = type.includes("Scholarly")
        ? "article-journal"
        : type === "BlogPosting"
          ? "post-weblog"
          : "article-newspaper";
      expect(resolveCitation({ claims }).citation).toMatchObject({
        title: "The full work title",
        type: expected,
      });
      expect(extractScholarlyMetadata(document, url).citation).toMatchObject({
        title: "The full work title",
        type: expected,
      });
    },
  );

  it("keeps a Highwire journal type even when OG and HTML corroborate webpage", () => {
    expect(
      resolve(
        page(`<meta name="citation_title" content="The paper"><meta name="citation_journal_title" content="The Journal">
      <meta property="og:type" content="article">${linked({ "@type": "WebPage", name: "The paper" })}`),
      ).citation,
    ).toMatchObject({ type: "article-journal" });
  });

  it.each(["dc.creator", "citation_author"])(
    "preserves complete grouped %s authors rather than a lexical single-list winner",
    (key) => {
      const second = key === "dc.creator" ? "dcterms.creator" : "citation_authors";
      const document =
        page(`<meta name="dc.title" content="A shared record"><meta name="${key}" content="Ada Example">
      <meta name="${second}" content="Sam Example">`);
      expect(resolve(document).citation?.["author"]).toEqual([
        { family: "Example", given: "Ada" },
        { family: "Example", given: "Sam" },
      ]);
    },
  );

  it("does not turn an article's own WebPage into its container", () => {
    const document = page(
      linked({
        "@graph": [
          { "@type": "WebPage", "@id": "#page", name: "The story" },
          {
            "@type": "NewsArticle",
            headline: "The full story",
            isPartOf: { "@id": "#page" },
            publisher: { name: "Example Media" },
          },
        ],
      }),
    );
    expect(
      pageClaims(document, url, observedAt).claims.filter(
        ({ field }) => field === "container-title",
      ),
    ).toEqual([]);
    expect(resolve(document).citation).not.toHaveProperty("container-title");
  });
});

describe("organisational bylines through the resolver", () => {
  it.each([
    "Associated Press",
    "AP",
    "Reuters",
    "Agence France-Presse",
    "AFP",
    "AAP",
    "PA Media",
    "Press Association",
    "Bloomberg",
    "United Press International",
    "dpa",
    "Xinhua",
    "Kyodo",
    "The Example News",
    "The Example Agency",
    "The Example Press",
    "The Example Media",
    "The Example Staff",
    "The Example Team",
    "The Example Foundation",
    "Example Media Inc.",
    "Example Media Ltd",
    "Wikimedia Foundation, Inc.",
  ])("keeps the untyped organisational byline %s literal", (byline) => {
    const document =
      page(`<meta name="dc.title" content="A report"><meta property="article:author" content="${byline}">
      ${linked({ "@type": "NewsArticle", headline: "A report", author: "Guardian staff reporter" })}`);
    expect(resolve(document).citation?.["author"]).toEqual([{ literal: byline }]);
    expect(extractScholarlyMetadata(document, url).citation?.["author"]).toEqual([
      { literal: byline },
    ]);
  });

  it("leaves ambiguous two-word organisational-looking names personal and ignores URL bylines", () => {
    const document =
      page(`<meta name="dc.title" content="A report"><meta name="author" content="Jane Press">
      <meta property="article:author" content="https://example.org/profile/jane">`);
    expect(resolve(document).citation?.["author"]).toEqual([cslName("Jane Press")]);
    expect(
      pageClaims(document, url, observedAt).claims.filter(({ field }) => field === "author"),
    ).toHaveLength(1);
  });
});

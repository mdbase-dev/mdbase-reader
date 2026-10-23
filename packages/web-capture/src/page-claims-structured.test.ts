// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { pageClaims } from "./page-claims.js";
import { resolveCitation } from "./resolver.js";

const url = "https://example.org/work";
const observedAt = "2026-10-23T10:00:00Z";
const linked = (node: unknown): string =>
  `<script type="application/ld+json">${JSON.stringify(node)}</script>`;

function capture(
  head: string,
  body = "",
): ReturnType<typeof pageClaims> & ReturnType<typeof resolveCitation> {
  const document = new DOMParser().parseFromString(
    `<html><head><title>A work</title>${head}</head><body>${body}</body></html>`,
    "text/html",
  );
  const batch = pageClaims(document, url, observedAt);
  return { ...batch, ...resolveCitation({ claims: batch.claims }) };
}

describe("explicit report, book and encyclopedia metadata", () => {
  it.each(["citation_type", "dc.type", "dcterms.type"])(
    "reads bibliographic genres from %s",
    (key) => {
      for (const [genre, type] of [
        ["Technical Report", "report"],
        ["Report", "report"],
        ["Book", "book"],
        ["book_chapter", "chapter"],
        ["encyclopediaArticle", "entry-encyclopedia"],
        ["Encyclopedia Article", "entry-encyclopedia"],
        ["entry-encyclopedia", "entry-encyclopedia"],
      ] as const) {
        const result = capture(`<meta name="${key}" content="${genre}">`);
        expect(result.citation?.type).toBe(type);
        expect(result.claims).toContainEqual(
          expect.objectContaining({ field: "type", value: type, evidence: key }),
        );
      }
    },
  );

  it.each([
    "Text",
    "Collection",
    "A report about books",
    "book review",
    "https://foreign.example/Book",
    "constructor",
  ])("does not guess a work genre from %s", (genre) => {
    for (const key of ["citation_type", "dc.type", "dcterms.type"]) {
      expect(capture(`<meta name="${key}" content="${genre}">`).citation?.type).not.toMatch(
        /^(?:book|chapter|report|entry-encyclopedia)$/u,
      );
    }
  });

  it("uses a Highwire report number as a report signal, not an ordinary volume number", () => {
    const report = capture(`
      <meta name="citation_technical_report_number" content="TR-42">
      <meta name="citation_title" content="Technical findings">
      <meta name="citation_publisher" content="Example Institute">
      <meta name="citation_publication_date" content="2023">
      <meta name="citation_doi" content="10.1234/report">`);
    expect(report.citation).toMatchObject({
      type: "report",
      title: "Technical findings",
      number: "TR-42",
      publisher: "Example Institute",
      issued: { "date-parts": [[2023]] },
    });
    expect(capture('<meta name="citation_volume" content="42">').citation?.type).toBe("article");
  });

  it("keeps Dublin Core title, person, publisher and issue date on a declared book", () => {
    expect(
      capture(`
      <meta name="DC.type" content="Book">
      <meta name="DC.title" content="The field guide">
      <meta name="DC.creator" content="Example, Ada">
      <meta name="dcterms.issued" content="1988-10-01">
      <meta name="dcterms.publisher" content="Example Press">
      <link rel="canonical" href="/edition/42">`).citation,
    ).toMatchObject({
      type: "book",
      title: "The field guide",
      author: [{ family: "Example", given: "Ada" }],
      issued: { "date-parts": [[1988, 10, 1]] },
      publisher: "Example Press",
      URL: "https://example.org/edition/42",
    });
  });

  it("does not infer a report from its title, a footer copyright year or an author's affiliation", () => {
    expect(
      capture(
        `
      <meta name="citation_title" content="Report on the book industry">
      <meta name="citation_author" content="Example, Ada">
      <meta name="citation_author_institution" content="Example Institute">`,
        "<footer>© Example Institute, 2023</footer>",
      ).citation,
    ).toMatchObject({
      type: "article",
      author: [{ family: "Example", given: "Ada" }],
    });
    const result = capture(
      "",
      "<h1>A report on books</h1><footer>© Example Institute, 2023</footer>",
    );
    expect(result.citation?.type).toBe("webpage");
    expect(result.citation?.["issued"]).toBeUndefined();
    expect(result.citation?.["author"]).toBeUndefined();
    expect(result.citation?.["publisher"]).toBeUndefined();
  });
});

describe("full schema.org type IRIs", () => {
  it.each(["http", "https"])(
    "reads %s schema Book and Report types and corporate authors",
    (protocol) => {
      for (const [term, type] of [
        ["Book", "book"],
        ["Report", "report"],
      ] as const) {
        const result = capture(
          linked({
            "@type": `${protocol}://schema.org/${term}`,
            name: "Structured work",
            url,
            author: {
              "@type": `${protocol}://schema.org/Organization`,
              name: "Example Research Council",
            },
            publisher: { "@type": "Organization", name: "Example Press" },
            datePublished: "2023",
            isbn: "9780140328721",
          }),
        );
        expect(result.citation).toMatchObject({
          type,
          title: "Structured work",
          author: [{ literal: "Example Research Council" }],
          publisher: "Example Press",
          issued: { "date-parts": [[2023]] },
        });
      }
    },
  );

  it.each([
    "https://foreign.example/Book",
    "https://schema.org.evil/Report",
    "schema:Book",
    "https://schema.org/Book#other",
  ])("does not treat another vocabulary or unsupported compact type as schema.org: %s", (type) => {
    expect(
      capture(linked({ "@type": type, name: "Not a recognized work" })).citation,
    ).toMatchObject({ type: "webpage", title: "A work" });
  });

  it("preserves graph references and excludes off-page recommendations with expanded types", () => {
    const result = capture(
      linked({
        "@graph": [
          { "@type": "https://schema.org/WebPage", url, mainEntity: { "@id": "#report" } },
          {
            "@type": ["https://schema.org/Report"],
            "@id": "#report",
            name: "The report",
            author: { "@id": "#council" },
          },
          {
            "@type": "https://schema.org/Organization",
            "@id": "#council",
            name: "Example Research Council",
          },
          {
            "@type": "https://schema.org/Book",
            url: "https://example.org/another",
            name: "Recommended book",
            datePublished: "1999",
          },
        ],
      }),
    );
    expect(result.citation).toMatchObject({
      type: "report",
      title: "The report",
      author: [{ literal: "Example Research Council" }],
    });
    expect(result.claims.some((claim) => claim.value === "Recommended book")).toBe(false);
    expect(result.citation?.["issued"]).toBeUndefined();
  });
});

const wikiHeading = '<h1 id="firstHeading"><span class="mw-page-title-main">A work</span></h1>';
const wikiFooter =
  '<footer><li id="footer-info-lastmod">This page was last edited on 20 October 2026, at 17:47 (UTC).</li></footer>';
const wikiNode = {
  "@type": "Article",
  name: "A work",
  url,
  datePublished: "2001-11-04T13:33:21Z",
  dateModified: "2026-10-20T17:47:05Z",
};

describe("wiki revision editions", () => {
  it("uses a visible, corroborated revision date rather than the page creation date on any host", () => {
    const result = capture(linked(wikiNode), wikiHeading + wikiFooter);
    expect(result.citation?.["issued"]).toEqual({ "date-parts": [[2026, 10, 20]] });
    expect(result.claims).toContainEqual(
      expect.objectContaining({ evidence: "MediaWiki revision dateModified" }),
    );
    // A wiki engine is not an encyclopedia declaration, nor evidence of an unseen permalink ID.
    expect(result.citation?.type).toBe("webpage");
    expect(result.citation?.["URL"]).toBe(url);
  });

  it("supports declared encyclopedia entries and explicitly supplied permanent URLs", () => {
    const result = capture(
      `
      <meta name="dc.type" content="Encyclopedia Article">
      <link rel="canonical" href="/work?oldid=42">
      ${linked(wikiNode)}`,
      wikiHeading + wikiFooter,
    );
    expect(result.citation).toMatchObject({
      type: "entry-encyclopedia",
      URL: `${url}?oldid=42`,
      issued: { "date-parts": [[2026, 10, 20]] },
    });
  });

  it.each([
    ["no heading", "", wikiFooter, wikiNode],
    ["no footer", wikiHeading, "", wikiNode],
    ["another heading", wikiHeading.replace("A work", "Another work"), wikiFooter, wikiNode],
    ["another revision date", wikiHeading, wikiFooter, { ...wikiNode, dateModified: "2026-10-21" }],
    ["partial revision date", wikiHeading, wikiFooter, { ...wikiNode, dateModified: "2026" }],
    ["no modification date", wikiHeading, wikiFooter, { ...wikiNode, dateModified: undefined }],
    [
      "a news article",
      wikiHeading,
      wikiFooter,
      { ...wikiNode, "@type": ["Article", "NewsArticle"] },
    ],
    ["a book", wikiHeading, wikiFooter, { ...wikiNode, "@type": "Book" }],
    ["a report", wikiHeading, wikiFooter, { ...wikiNode, "@type": "Report" }],
  ])("keeps publication dates with %s", (_label, heading, footer, node) => {
    expect(capture(linked(node), heading + footer).citation?.["issued"]).toEqual({
      "date-parts": [[2001, 11, 4]],
    });
  });

  it("does not fall back to modification dates on ordinary encyclopedia pages", () => {
    const result = capture(
      `<meta name="dc.type" content="Encyclopedia Article">${linked({ ...wikiNode, datePublished: undefined })}`,
    );
    expect(result.citation?.type).toBe("entry-encyclopedia");
    expect(result.citation?.["issued"]).toBeUndefined();
  });
});

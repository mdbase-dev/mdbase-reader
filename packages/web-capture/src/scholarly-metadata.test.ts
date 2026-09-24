// @vitest-environment happy-dom
import { validateCslItem } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { sanitizedCitation } from "./csl-values.js";
import { arxivIdentifier, doiFromText, doiFromUrl, resolveDoiCitation } from "./doi.js";
import { extractScholarlyMetadata } from "./scholarly-metadata.js";

function page(head: string): Document {
  return new DOMParser().parseFromString(
    `<html><head>${head}</head><body></body></html>`,
    "text/html",
  );
}

describe("embedded scholarly metadata", () => {
  it("reads Highwire citation tags into a structured CSL journal article", () => {
    const document = page(`
      <meta name="citation_title" content="Deep learning">
      <meta name="citation_author" content="LeCun, Yann">
      <meta name="citation_author" content="Yoshua Bengio">
      <meta name="citation_publication_date" content="2015/05/27">
      <meta name="citation_journal_title" content="Nature">
      <meta name="citation_volume" content="521">
      <meta name="citation_issue" content="7553">
      <meta name="citation_firstpage" content="436">
      <meta name="citation_lastpage" content="444">
      <meta name="citation_doi" content="doi:10.1038/nature14539">
      <meta name="citation_pdf_url" content="/articles/nature14539.pdf">`);
    const result = extractScholarlyMetadata(
      document,
      "https://www.nature.com/articles/nature14539",
    );
    expect(result.doi).toBe("10.1038/nature14539");
    expect(result.pdfUrl).toBe("https://www.nature.com/articles/nature14539.pdf");
    expect(result.citation).toMatchObject({
      type: "article-journal",
      title: "Deep learning",
      author: [
        { family: "LeCun", given: "Yann" },
        { family: "Bengio", given: "Yoshua" },
      ],
      issued: { "date-parts": [[2015, 5, 27]] },
      "container-title": "Nature",
      volume: "521",
      issue: "7553",
      page: "436-444",
      DOI: "10.1038/nature14539",
    });
    expect(validateCslItem({ id: "lecundeep2015", ...result.citation }).valid).toBe(true);
  });

  it("uses Dublin Core only when it carries scholarly evidence", () => {
    const plain = page('<meta name="DC.title" content="A blog post">');
    expect(extractScholarlyMetadata(plain, "https://blog.example/post").citation).toBeUndefined();
    const identified = page(`
      <meta name="DC.title" content="Thesis title">
      <meta name="DC.creator" content="Ada Lovelace">
      <meta name="DC.identifier" content="https://doi.org/10.5555/abc.123">`);
    expect(extractScholarlyMetadata(identified, "https://repo.example/1").citation).toMatchObject({
      title: "Thesis title",
      DOI: "10.5555/abc.123",
    });
  });

  it("recognises scholarly JSON-LD inside a graph", () => {
    const document = page(
      `<script type="application/ld+json">${JSON.stringify({
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
      })}</script>`,
    );
    expect(extractScholarlyMetadata(document, "https://example.org/a").citation).toMatchObject({
      title: "Graph article",
      author: [{ family: "Hopper", given: "Grace" }],
      "container-title": "Journal of Examples",
    });
  });

  it("derives arXiv DOIs from arXiv pages", () => {
    const result = extractScholarlyMetadata(page(""), "https://arxiv.org/abs/1706.03762v7");
    expect(result.doi).toBe("10.48550/arXiv.1706.03762");
  });

  it("leaves ordinary web pages alone", () => {
    const result = extractScholarlyMetadata(
      page('<meta property="og:title" content="News">'),
      "https://news.example/story",
    );
    expect(result).toEqual({});
  });
});

describe("DOI handling", () => {
  it("finds DOIs in text and publisher URLs", () => {
    expect(doiFromText("See https://doi.org/10.1000/xyz123.")).toBe("10.1000/xyz123");
    expect(doiFromUrl("https://onlinelibrary.wiley.com/doi/abs/10.1002/asi.24750")).toBe(
      "10.1002/asi.24750",
    );
    expect(doiFromUrl("https://example.com/blog/10-things")).toBeUndefined();
    expect(arxivIdentifier("https://arxiv.org/pdf/2101.00001v2.pdf")).toBe("2101.00001v2");
  });

  it("requests CSL-JSON by content negotiation and strips registry bookkeeping", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        type: "journal-article",
        title: "Deep learning",
        author: [{ family: "LeCun", given: "Yann" }],
        reference: [{ key: "ref1" }],
        license: [{ URL: "https://example.com" }],
        indexed: { "date-parts": [[2026, 9, 24]] },
        "container-title": "Nature",
      }),
    );
    const citation = await resolveDoiCitation("10.1038/nature14539", { fetch: fetcher });
    expect(fetcher).toHaveBeenCalledWith(
      "https://doi.org/10.1038/nature14539",
      expect.objectContaining({
        headers: { Accept: "application/vnd.citationstyles.csl+json" },
        credentials: "omit",
      }),
    );
    expect(citation).toEqual({
      type: "article",
      title: "Deep learning",
      author: [{ family: "LeCun", given: "Yann" }],
      "container-title": "Nature",
      DOI: "10.1038/nature14539",
    });
  });

  it("reports unregistered DOIs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 404 }));
    await expect(resolveDoiCitation("10.0000/none", { fetch: fetcher })).rejects.toThrow(
      "not registered",
    );
  });

  it("drops individually invalid fields instead of the whole citation", () => {
    expect(
      sanitizedCitation({ type: "book", title: "Kept", author: "not a name list", volume: 3 }),
    ).toEqual({ type: "book", title: "Kept", volume: 3 });
  });
});

// @vitest-environment happy-dom
import { validateCslItem } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { sanitizedCitation } from "./csl-values.js";
import { arxivIdentifier, doiFromText, doiFromUrl, resolveDoiCitation } from "./doi.js";
import { extractScholarlyMetadata } from "./scholarly-metadata.js";

describe("registry bibliographic minimum", () => {
  it.each([
    {},
    { type: "article" },
    { DOI: "10.1234/work" },
    { title: "  " },
    { "container-title": "Journal" },
    { title: 42 },
    { "container-title": "Journal", author: [] },
  ])("rejects records without meaningful work evidence: %j", async (record) => {
    await expect(
      resolveDoiCitation("10.1234/work", {
        fetch: vi.fn<typeof fetch>().mockResolvedValue(Response.json(record)),
      }),
    ).rejects.toThrow("no bibliographic data");
  });

  it.each([
    { title: "Work" },
    { "container-title": "Journal", issued: { "date-parts": [[2026]] } },
    { "container-title": "Journal", author: [{ family: "Example" }] },
  ])("accepts a title or a container supported by other bibliography: %j", async (record) => {
    await expect(
      resolveDoiCitation("10.1234/work", {
        fetch: vi.fn<typeof fetch>().mockResolvedValue(Response.json(record)),
      }),
    ).resolves.toMatchObject({ DOI: "10.1234/work" });
  });

  it.each([
    ["https://doi.org/10.1234/known?token=secret#private", "10.1234/known"],
    ["https://publisher.example/doi/10.1234%2Fknown%3Ftoken=secret", "10.1234/known"],
    ["https://publisher.example/doi/10.1234/known%23private", "10.1234/known"],
    ["https://publisher.example/doi/10.1234/bad%ZZ?token=secret", "10.1234/bad%ZZ"],
    ["https://publisher.example/article?doi=10.1234/secret#10.1234/private", undefined],
  ])("only decodes the DOI pathname: %s", (url, doi) => {
    expect(doiFromUrl(url)).toBe(doi);
  });
});

function page(head: string): Document {
  return new DOMParser().parseFromString(
    `<html><head>${head}</head><body></body></html>`,
    "text/html",
  );
}

describe("embedded scholarly metadata", () => {
  it("reads Highwire citation tags into a structured CSL journal article", () => {
    const document = page(`
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
      <meta name="citation_pdf_url" content="/articles/171737a0.pdf">`);
    const result = extractScholarlyMetadata(document, "https://www.nature.com/articles/171737a0");
    expect(result.doi).toBe("10.1038/171737a0");
    expect(result.pdfUrl).toBe("https://www.nature.com/articles/171737a0.pdf");
    expect(result.citation).toMatchObject({
      type: "article-journal",
      title: "Molecular structure of nucleic acids",
      author: [
        { family: "Watson", given: "James D." },
        { family: "Crick", given: "Francis" },
      ],
      issued: { "date-parts": [[1953, 4, 25]] },
      "container-title": "Nature",
      volume: "171",
      issue: "4356",
      page: "737-738",
      DOI: "10.1038/171737a0",
    });
    expect(validateCslItem({ id: "watsonmolecular1953", ...result.citation }).valid).toBe(true);
  });

  it("resolves Dublin Core pages with or without an identifier", () => {
    const plain = page('<meta name="DC.title" content="A blog post">');
    expect(extractScholarlyMetadata(plain, "https://blog.example/post").citation).toEqual({
      type: "webpage",
      title: "A blog post",
      URL: "https://blog.example/post",
    });
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
    const result = extractScholarlyMetadata(page(""), "https://arxiv.org/abs/0704.0001v2");
    expect(result.doi).toBe("10.48550/arXiv.0704.0001");
  });

  it("resolves ordinary web pages from their title evidence", () => {
    const result = extractScholarlyMetadata(
      page('<meta property="og:title" content="News">'),
      "https://news.example/story",
    );
    expect(result).toEqual({
      citation: { type: "webpage", title: "News", URL: "https://news.example/story" },
    });
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

  it("requests CSL-JSON by content negotiation, maps Crossref types and strips bookkeeping", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        type: "journal-article",
        title: "Molecular structure of nucleic acids",
        author: [{ family: "Watson", given: "James D." }],
        reference: [{ key: "ref1" }],
        license: [{ URL: "https://example.com" }],
        indexed: { "date-parts": [[2026, 9, 24]] },
        "container-title": "Nature",
      }),
    );
    const citation = await resolveDoiCitation("10.1038/171737a0", { fetch: fetcher });
    expect(fetcher).toHaveBeenCalledWith(
      "https://doi.org/10.1038/171737a0",
      expect.objectContaining({
        headers: { Accept: "application/vnd.citationstyles.csl+json" },
        credentials: "omit",
      }),
    );
    expect(citation).toEqual({
      type: "article-journal",
      title: "Molecular structure of nucleic acids",
      author: [{ family: "Watson", given: "James D." }],
      "container-title": "Nature",
      DOI: "10.1038/171737a0",
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

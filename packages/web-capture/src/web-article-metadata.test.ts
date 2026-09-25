// @vitest-environment happy-dom
import { validateCslItem } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { extractScholarlyMetadata } from "./scholarly-metadata.js";

function page(head: string): Document {
  return new DOMParser().parseFromString(
    `<html><head>${head}</head><body></body></html>`,
    "text/html",
  );
}

describe("embedded article metadata", () => {
  it("cites news articles from a JSON-LD graph that names people by reference", () => {
    const document = page(`
      <meta property="og:site_name" content="The Daily Example">
      <meta property="og:title" content="Rivers rise | The Daily Example">
      <script type="application/ld+json">${JSON.stringify({
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
      })}</script>`);
    const result = extractScholarlyMetadata(document, "https://news.example/rivers");
    expect(result.doi).toBeUndefined();
    expect(result.citation).toEqual({
      type: "article-newspaper",
      title: "Rivers rise after record rain",
      author: [{ family: "Doe", given: "Jane" }, { literal: "Example Wire" }],
      issued: { "date-parts": [[2024, 3, 2]] },
      "container-title": "The Daily Example",
      publisher: "Example Media Ltd",
      section: "Environment",
      abstract: "Flood warnings across the valley.",
      language: "en-GB",
      keyword: "floods, weather",
      URL: "https://news.example/rivers",
    });
    expect(validateCslItem({ id: "doerivers2024", ...result.citation }).valid).toBe(true);
  });

  it("cites blog posts as weblog posts", () => {
    const document = page(
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "BlogPosting",
        headline: "Notes on reading",
        author: { "@type": "Person", name: "Sam Writer" },
        datePublished: "2023-11-05",
      })}</script>`,
    );
    expect(extractScholarlyMetadata(document, "https://blog.example/notes").citation).toMatchObject(
      {
        type: "post-weblog",
        title: "Notes on reading",
        author: [{ family: "Writer", given: "Sam" }],
      },
    );
  });

  it("cites Open Graph articles as web pages and ignores profile-URL authors", () => {
    const document = page(`
      <meta property="og:type" content="article">
      <meta property="og:title" content="How tides work">
      <meta property="og:site_name" content="Sea Notes">
      <meta property="og:locale" content="en_AU">
      <meta property="og:description" content="A short explainer.">
      <meta property="article:published_time" content="2022-07-19T10:00:00+10:00">
      <meta property="article:author" content="https://facebook.com/seanotes">
      <meta name="author" content="Alex Marin">
      <meta property="article:tag" content="tides">`);
    expect(extractScholarlyMetadata(document, "https://sea.example/tides").citation).toEqual({
      type: "webpage",
      title: "How tides work",
      author: [{ family: "Marin", given: "Alex" }],
      issued: { "date-parts": [[2022, 7, 19]] },
      "container-title": "Sea Notes",
      abstract: "A short explainer.",
      language: "en-AU",
      keyword: "tides",
      URL: "https://sea.example/tides",
    });
  });
});

// @vitest-environment happy-dom
import { validateCslItem } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { loadCitationCorpus } from "./test/citation-corpus.js";

const corpus = loadCitationCorpus();
const parse = (html: string): Document => new DOMParser().parseFromString(html, "text/html");

describe("citation replay corpus", () => {
  it("contains the nine comparison sites and a variety of non-news works", () => {
    expect(corpus.length).toBe(36);
    expect(new Set(corpus.map(({ slug }) => slug)).size).toBe(corpus.length);
    expect(corpus.map(({ slug }) => slug)).toEqual(
      expect.arrayContaining([
        "wikipedia-australia",
        "github-translation-server",
        "mdn-array-map",
        "nyt",
        "guardian",
        "abc",
        "bbc",
        "verge",
        "ars",
        "arxiv-xgboost",
        "arxiv-adam",
        "repec-working-paper",
        "substack-cyborgs",
        "blog-web-bloat",
        "zenodo-urban-sound",
        "ons-inflation",
        "legislation-data-protection",
        "podcast-changelog",
        "acl-bleu",
        "book-gutenberg",
        "rfc-http",
        "usenix-raft",
        "nonenglish-cnrs-medieval",
        "patent-pagerank",
      ]),
    );
    expect(corpus.filter(({ doi }) => doi).length).toBe(10);
  });

  it.each(corpus)("$slug is a small, inert, valid replay case", (entry) => {
    expect(new URL(entry.url).protocol).toBe("https:");
    expect(Number.isFinite(Date.parse(entry.retrievedAt))).toBe(true);
    expect(entry.notes.length).toBeGreaterThan(1);
    expect(entry.notes.every((note) => typeof note === "string" && note.trim())).toBe(true);
    expect(new TextEncoder().encode(entry.html).length).toBeLessThan(20_000);
    const document = parse(entry.html);
    expect(document.title.trim()).not.toBe("");
    expect(document.querySelector("style, svg, iframe")).toBeNull();
    for (const element of document.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        expect(attribute.name).not.toMatch(/^on/iu);
        expect(attribute.value).not.toMatch(/^\s*javascript:/iu);
      }
    }
    for (const script of document.querySelectorAll("script")) {
      expect(script.type).toBe("application/ld+json");
      expect(() => {
        JSON.parse(script.textContent) as unknown;
      }).not.toThrow();
    }
    expect(validateCslItem({ ...entry.expected, id: `corpus-${entry.slug}` })).toMatchObject({
      valid: true,
    });
    expect(entry.expected["title"]).toEqual(expect.any(String));
    expect(entry.expected["URL"]).toEqual(expect.any(String));
    expect(new URL(String(entry.expected["URL"])).protocol).toBe("https:");
    expect(entry.citoid).toBeDefined();
    for (const response of [entry.citoid, entry.doi]) {
      if (!response) {
        continue;
      }
      expect(Number.isInteger(response.status)).toBe(true);
      expect(response.status).toBeGreaterThanOrEqual(100);
      expect(response.status).toBeLessThan(600);
      expect(response).toHaveProperty("body");
      expect(new TextEncoder().encode(JSON.stringify(response)).length).toBeLessThan(100_000);
    }
  });
});

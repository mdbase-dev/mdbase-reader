// @vitest-environment happy-dom
import { validateCslItem } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { extractScholarlyMetadata } from "./scholarly-metadata.js";
import { loadCitationCorpus } from "./test/citation-corpus.js";

const corpus = loadCitationCorpus();
const parse = (html: string): Document => new DOMParser().parseFromString(html, "text/html");

/** Cosmetic case/whitespace is not an error; dates, name structure and URL editions are. */
function normalized(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\s+/gu, " ").trim().toLowerCase();
  }
  if (Array.isArray(value)) {
    return value.map(normalized);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, content]) => [key, normalized(content)]),
    );
  }
  return value;
}

function baseline(): Record<string, { matched: number; total: number; wrong: string[] }> {
  return Object.fromEntries(
    corpus.map((entry) => {
      const actual = extractScholarlyMetadata(parse(entry.html), entry.url).citation;
      const fields = Object.keys(entry.expected);
      const wrong = fields.filter(
        (field) =>
          JSON.stringify(normalized(actual?.[field])) !==
          JSON.stringify(normalized(entry.expected[field])),
      );
      return [entry.slug, { matched: fields.length - wrong.length, total: fields.length, wrong }];
    }),
  );
}

describe("citation replay corpus", () => {
  it("contains the nine comparison sites and a variety of non-news works", () => {
    expect(corpus.length).toBe(21);
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
      ]),
    );
    expect(corpus.filter(({ doi }) => doi).length).toBe(6);
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

it("documents the pre-claims extractor's field-level baseline (not a resolver target)", () => {
  expect(baseline()).toEqual({
    abc: { matched: 7, total: 7, wrong: [] },
    ars: { matched: 7, total: 7, wrong: [] },
    "arxiv-attention": { matched: 6, total: 7, wrong: ["publisher"] },
    bbc: { matched: 7, total: 7, wrong: [] },
    "blog-paul-graham": {
      matched: 0,
      total: 6,
      wrong: ["type", "title", "author", "issued", "container-title", "URL"],
    },
    "elife-brain": { matched: 7, total: 8, wrong: ["type"] },
    "github-translation-server": {
      matched: 0,
      total: 5,
      wrong: ["type", "title", "author", "container-title", "URL"],
    },
    "government-ipcc": {
      matched: 0,
      total: 6,
      wrong: ["type", "title", "author", "issued", "publisher", "URL"],
    },
    guardian: { matched: 7, total: 7, wrong: [] },
    "guardian-ap": { matched: 6, total: 7, wrong: ["author"] },
    "mdn-array-map": {
      matched: 0,
      total: 7,
      wrong: ["type", "title", "author", "issued", "container-title", "publisher", "URL"],
    },
    "nature-dna": { matched: 7, total: 8, wrong: ["issued"] },
    nyt: {
      matched: 0,
      total: 6,
      wrong: ["type", "title", "author", "issued", "container-title", "URL"],
    },
    "openlibrary-fox": {
      matched: 0,
      total: 6,
      wrong: ["type", "title", "author", "issued", "publisher", "URL"],
    },
    "peerj-sharing": {
      matched: 0,
      total: 8,
      wrong: ["type", "title", "author", "issued", "container-title", "publisher", "DOI", "URL"],
    },
    "plos-research": { matched: 7, total: 8, wrong: ["issued"] },
    "springer-imagenet": { matched: 7, total: 8, wrong: ["issued"] },
    "stackoverflow-branch": {
      matched: 0,
      total: 6,
      wrong: ["type", "title", "author", "issued", "container-title", "URL"],
    },
    verge: { matched: 7, total: 7, wrong: [] },
    "wikipedia-australia": {
      matched: 1,
      total: 6,
      wrong: ["type", "title", "issued", "container-title", "URL"],
    },
    "youtube-first": {
      matched: 0,
      total: 6,
      wrong: ["type", "title", "author", "issued", "container-title", "URL"],
    },
  });
});

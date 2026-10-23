// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { pageClaims } from "./page-claims.js";
import { resolveCitation } from "./resolver.js";
import { loadCitationCorpus } from "./test/citation-corpus.js";

import type { Claim } from "./claims.js";

const corpus = loadCitationCorpus();
const conventions = [
  ["patent-pagerank", '[itemprop="publicationNumber"]'],
  ["book-gutenberg", "table.bibrec"],
  ["rfc-http", "#rfcnum"],
  ["repec-working-paper", 'meta[name="citation_type"]'],
  ["arxiv-adam", "h1.title"],
  ["legislation-data-protection", "h1#pageTitle"],
  ["acl-bleu", "#title a"],
  ["nonenglish-cnrs-medieval", "h1.node-title"],
  ["ons-inflation", "p"],
  ["podcast-changelog", "h1.episode-header-title"],
  ["substack-cyborgs", ".byline-wrapper"],
  ["usenix-raft", 'meta[name="citation_conference_title"]'],
] as const;

function fixture(slug: string): { document: Document; url: string } {
  const entry = corpus.find((item) => item.slug === slug);
  if (!entry) {
    throw new Error(`Missing fixture ${slug}`);
  }
  return { document: new DOMParser().parseFromString(entry.html, "text/html"), url: entry.url };
}

function claims(document: Document, url: string): readonly Claim[] {
  return pageClaims(document, url, "2026-10-23T00:00:00Z").claims;
}

function adapters(document: Document, url: string): readonly Claim[] {
  return claims(document, url).filter((claim) => claim.source.kind === "site-adapter");
}

describe.each(conventions)("%s convention", (slug, required) => {
  it("has positive evidence in the captured page", () => {
    const { document, url } = fixture(slug);
    expect(adapters(document, url).length).toBeGreaterThan(0);
  });

  it("does not interpret a copy on an unrelated host", () => {
    const { document, url } = fixture(slug);
    const other = new URL(url);
    other.hostname = "unrelated.example";
    expect(adapters(document, other.href)).toEqual([]);
  });

  it("does not interpret the platform homepage or a listing", () => {
    const { document, url } = fixture(slug);
    expect(adapters(document, new URL("/", url).href)).toEqual([]);
  });

  it("requires the bibliographic page shape, not just the host/path", () => {
    const { document, url } = fixture(slug);
    document.querySelector(required)?.remove();
    expect(adapters(document, url)).toEqual([]);
  });
});

it("does not infer Dan Luu's creator or date from a bare title and personal domain", () => {
  const { document, url } = fixture("blog-web-bloat");
  expect(
    claims(document, url).filter((claim) => ["author", "issued"].includes(claim.field)),
  ).toEqual([]);
});

it("keeps a podcast's unlabelled guests/hosts out of author claims", () => {
  const { document, url } = fixture("podcast-changelog");
  expect(claims(document, url).filter((claim) => claim.field === "author")).toEqual([]);
});

it("does not synthesize DOIs from familiar RFC/NBER identifier patterns", () => {
  for (const slug of ["rfc-http", "repec-working-paper"]) {
    const { document, url } = fixture(slug);
    expect(claims(document, url).filter((claim) => claim.field === "DOI")).toEqual([]);
  }
});

it("does not make every ACL-hosted proceedings publisher the ACL", () => {
  const { document, url } = fixture("acl-bleu");
  document
    .querySelector('meta[name="citation_conference_title"]')
    ?.setAttribute("content", "Proceedings of LREC");
  expect(adapters(document, url).some((claim) => claim.field === "publisher")).toBe(false);
});

it("pairs RFC full names with explicit editor roles without retaining them as authors", () => {
  const { document, url } = fixture("rfc-http");
  const citation = resolveCitation({ claims: claims(document, url) }).citation;
  expect(citation?.["editor"]).toEqual([
    { family: "Fielding", given: "Roy T." },
    { family: "Nottingham", given: "Mark" },
    { family: "Reschke", given: "Julian" },
  ]);
  expect(citation?.["author"]).toBeUndefined();
});

it("does not reclassify RFC creators without matching editor role markup", () => {
  const { document, url } = fixture("rfc-http");
  document.querySelectorAll(".editor").forEach((element) => element.remove());
  const citation = resolveCitation({ claims: claims(document, url) }).citation;
  expect(citation?.["editor"]).toBeUndefined();
  expect(citation?.["author"]).toHaveLength(3);
});

it("requires arXiv's embedded identifier to agree with the abstract route", () => {
  const { document, url } = fixture("arxiv-adam");
  document.querySelector('meta[name="citation_arxiv_id"]')?.setAttribute("content", "9999.99999");
  expect(adapters(document, url)).toEqual([]);
});

it("does not confuse a Substack-like byline with a verified publication", () => {
  const { document, url } = fixture("substack-cyborgs");
  document.querySelectorAll('script[type="application/ld+json"]').forEach((element) => {
    element.textContent = element.textContent.replace(
      '"pub:1180644"',
      '"not-a-substack-publication"',
    );
  });
  expect(adapters(document, url)).toEqual([]);
});

it("does not derive royal assent or a conference month from identifiers/year metadata", () => {
  const legislation = fixture("legislation-data-protection");
  expect(
    claims(legislation.document, legislation.url).filter((claim) => claim.field === "issued"),
  ).toEqual([]);
  const usenix = fixture("usenix-raft");
  const dates = claims(usenix.document, usenix.url).filter((claim) => claim.field === "issued");
  expect(dates.map((claim) => claim.value)).toEqual([{ "date-parts": [[2014]] }]);
});

// @vitest-environment happy-dom
import { expect, it } from "vitest";

import { pageClaims } from "./page-claims.js";
import { citoidClaims, doiClaims } from "./provider-claims.js";
import { resolveCitation } from "./resolver.js";
import { loadCitationCorpus } from "./test/citation-corpus.js";

import type { Claim } from "./claims.js";
import type { CorpusCase, CorpusResponse } from "./test/citation-corpus.js";

const corpus = loadCitationCorpus();

function recorded(response: CorpusResponse): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { "content-type": "application/json" },
      }),
    );
}

/** As in the baseline: case and whitespace are cosmetic; everything else is scored. */
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

/** Page claims, then the recorded doi.org and Citoid responses, through the real providers. */
async function wrongFields(entry: CorpusCase, remote: boolean): Promise<string[]> {
  const document = new DOMParser().parseFromString(entry.html, "text/html");
  const page = pageClaims(document, entry.url, entry.retrievedAt);
  const claims: Claim[] = [...page.claims];
  if (remote) {
    const now = (): Date => new Date(entry.retrievedAt);
    const doi = page.identifiers?.doi;
    if (doi && entry.doi) {
      claims.push(...(await doiClaims(doi, { fetch: recorded(entry.doi), now })).claims);
    }
    if (entry.citoid) {
      claims.push(
        ...(await citoidClaims(entry.url, { fetch: recorded(entry.citoid), now })).claims,
      );
    }
  }
  const citation = resolveCitation({ claims }).citation;
  return Object.keys(entry.expected).filter(
    (field) =>
      JSON.stringify(normalized(citation?.[field])) !==
      JSON.stringify(normalized(entry.expected[field])),
  );
}

/**
 * Fields each case still gets wrong. A ratchet, not a target: when a change fixes a field,
 * remove it here; when one breaks a field, justify it or fix the resolver.
 */
const stillWrong: Record<string, { readonly page: string[]; readonly remote: string[] }> = {
  abc: { page: [], remote: [] },
  ars: { page: [], remote: [] },
  "arxiv-attention": { page: ["publisher"], remote: [] },
  bbc: { page: [], remote: [] },
  "blog-paul-graham": {
    page: ["type", "author", "issued", "container-title"],
    remote: ["type", "author", "issued", "container-title"],
  },
  "elife-brain": { page: [], remote: [] },
  "github-translation-server": { page: ["type", "title", "author"], remote: ["author"] },
  "government-ipcc": {
    page: ["type", "title", "author", "issued", "publisher"],
    remote: ["type", "title", "author", "issued", "publisher"],
  },
  guardian: { page: [], remote: [] },
  "guardian-ap": { page: [], remote: [] },
  "mdn-array-map": {
    page: ["author", "issued", "publisher"],
    remote: ["author", "publisher"],
  },
  "nature-dna": { page: [], remote: [] },
  // A blocked page now yields no citation, including no URL-only shell masquerading as one.
  nyt: { page: ["type", "title", "author", "issued", "container-title", "URL"], remote: [] },
  "openlibrary-fox": {
    page: ["type", "title", "author", "issued", "publisher", "URL"],
    remote: [],
  },
  "peerj-sharing": {
    page: ["type", "title", "author", "issued", "container-title", "publisher", "DOI", "URL"],
    remote: ["type", "title", "author", "issued", "container-title", "publisher", "DOI", "URL"],
  },
  "plos-research": { page: [], remote: [] },
  "springer-imagenet": { page: [], remote: [] },
  "stackoverflow-branch": {
    page: ["type", "title", "author", "issued", "container-title", "URL"],
    remote: ["type", "author", "issued"],
  },
  verge: { page: [], remote: [] },
  "wikipedia-australia": { page: ["type", "issued", "URL"], remote: [] },
  "youtube-first": { page: [], remote: [] },
  // Expansion captured against 9128f24; expectations describe the work, not the winner.
  "acl-bleu": {
    page: ["container-title", "publisher"],
    remote: ["title", "issued", "container-title", "page"],
  },
  "arxiv-adam": { page: ["publisher"], remote: [] },
  "arxiv-xgboost": {
    page: ["publisher"],
    remote: ["type", "title", "issued", "publisher", "DOI", "URL"],
  },
  "blog-web-bloat": {
    page: ["type", "author", "issued"],
    remote: ["type", "author", "issued"],
  },
  "book-gutenberg": {
    page: ["type", "title", "author", "issued", "publisher"],
    remote: ["publisher"],
  },
  "legislation-data-protection": {
    page: ["type", "issued", "number", "URL"],
    remote: ["type", "issued", "number", "URL"],
  },
  "nonenglish-cnrs-medieval": {
    page: ["type", "author", "issued"],
    remote: ["type", "author", "issued"],
  },
  "ons-inflation": {
    page: ["type", "author"],
    remote: ["type", "title", "author"],
  },
  "patent-pagerank": {
    page: ["type", "title", "author", "issued", "number"],
    remote: ["issued"],
  },
  "podcast-changelog": {
    page: ["type", "title", "author", "issued", "container-title", "publisher", "number"],
    remote: ["type", "title", "author", "container-title", "publisher", "number"],
  },
  "repec-working-paper": {
    page: ["type", "author", "issued", "publisher", "DOI", "URL"],
    remote: ["type", "publisher", "DOI", "URL"],
  },
  "rfc-http": {
    page: ["type", "title", "editor", "issued", "publisher", "number", "DOI"],
    remote: ["editor", "publisher", "number", "URL"],
  },
  "substack-cyborgs": {
    page: ["type", "container-title"],
    remote: ["type", "container-title"],
  },
  "usenix-raft": { page: ["issued", "publisher"], remote: ["issued", "publisher", "ISBN"] },
  "zenodo-urban-sound": {
    page: ["type", "issued", "publisher", "version"],
    remote: ["version", "URL"],
  },
};

it("replays the corpus through claims and the resolver", async () => {
  const report: Record<string, { page: string[]; remote: string[] }> = {};
  for (const entry of corpus) {
    report[entry.slug] = {
      page: await wrongFields(entry, false),
      remote: await wrongFields(entry, true),
    };
  }
  expect(report).toEqual(stillWrong);
});

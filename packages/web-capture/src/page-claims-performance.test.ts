// @vitest-environment happy-dom
import { expect, it } from "vitest";

import { pageClaims } from "./page-claims.js";
import { resolveCitation } from "./resolver.js";

import type { Claim } from "./claims.js";

const observedAt = "2026-10-21T12:00:00Z";
const pageUrl = "https://news.example/stories";
const stories = Array.from({ length: 2_000 }, (_, index) => ({
  "@type": "NewsArticle",
  headline: `Story ${index}`,
  author: { "@type": "Person", name: `Reporter ${index}` },
  datePublished: `${2000 + Math.floor(index / 336)}-${String(1 + (Math.floor(index / 28) % 12)).padStart(2, "0")}-${String(1 + (index % 28)).padStart(2, "0")}`,
  url: `https://news.example/story/${index}`,
}));

function bestTime(run: () => void): number {
  const samples = Array.from({ length: 3 }, () => {
    const start = performance.now();
    run();
    return performance.now() - start;
  });
  return Math.min(...samples);
}

it("resolves a 2,000-node listing without citing its first story in under 300ms", () => {
  const document = new DOMParser().parseFromString(
    `<title>Latest stories</title><script type="application/ld+json">${JSON.stringify({
      "@graph": [
        { "@type": "ItemList", itemListElement: stories.map((story) => ({ item: story })) },
        ...stories,
      ],
    })}</script><h1>Latest stories</h1>`,
    "text/html",
  );
  let result: ReturnType<typeof resolveCitation>;
  const ms = bestTime(() => {
    result = resolveCitation({ claims: pageClaims(document, pageUrl, observedAt).claims });
  });
  console.info(`2k JSON-LD nodes, pageClaims + resolveCitation best-of-3: ${ms.toFixed(1)}ms`);
  expect(result!.citation).toMatchObject({ title: "Latest stories", type: "webpage" });
  expect(result!.citation).not.toHaveProperty("author");
  expect(ms).toBeLessThan(300);
}, 30_000);

it("groups 8,000 diverse claims without pairwise scans in under 750ms", () => {
  // Keep exercising the resolver even when page selection correctly excludes list entries.
  const claims: Claim[] = stories.flatMap((story) =>
    [
      { field: "title", value: story.headline },
      { field: "author", value: [{ family: story.author.name }] },
      { field: "issued", value: { "date-parts": [story.datePublished.split("-").map(Number)] } },
      { field: "type", value: "article-newspaper" },
    ].map((claim) => ({ ...claim, source: { kind: "page", signal: "json-ld" }, observedAt })),
  );
  const ms = bestTime(() => {
    resolveCitation({ claims });
  });
  console.info(`8k diverse claims, resolveCitation best-of-3: ${ms.toFixed(1)}ms`);
  expect(ms).toBeLessThan(750);
}, 30_000);

// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { pageClaims } from "./page-claims.js";
import { resolveCitation } from "./resolver.js";

const pageUrl = "https://news.example/stories";
const observedAt = "2026-10-21T12:00:00Z";
const linked = (data: unknown): string =>
  `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const story = (index: number) => ({
  "@id": `https://news.example/story/${index}#article`,
  "@type": "NewsArticle",
  headline: `Story ${index}`,
  author: { "@type": "Person", name: `Reporter ${index}` },
  identifier: `10.1234/story${index}`,
});

function batch(head: string) {
  const document = new DOMParser().parseFromString(
    `<title>Latest stories</title>${head}<h1>Latest stories</h1>`,
    "text/html",
  );
  return pageClaims(document, pageUrl, observedAt);
}

function citation(head: string) {
  return resolveCitation({ claims: batch(head).claims }).citation;
}

describe("page-scoped linked data", () => {
  it.each([false, true])("does not cite the first of many stories (ItemList: %s)", (itemList) => {
    const stories = Array.from({ length: 100 }, (_, i) => story(i));
    const result = batch(
      linked({
        "@graph": [
          ...(itemList
            ? [{ "@type": "ItemList", itemListElement: stories.map((item) => ({ item })) }]
            : []),
          ...stories,
        ],
      }),
    );
    expect(resolveCitation({ claims: result.claims }).citation).toMatchObject({
      type: "webpage",
      title: "Latest stories",
    });
    expect(result.identifiers).toBeUndefined();
    expect(result.claims.some(({ field }) => field === "author" || field === "DOI")).toBe(false);
  });

  it.each(["anonymous", "fragments", "mixed types"])(
    "does not cite Story 0 from many %s nodes even without off-page URLs",
    (kind) => {
      const result = citation(
        linked({
          "@graph": Array.from({ length: 100 }, (_, i) => ({
            "@type": kind === "mixed types" ? ["NewsArticle", "WebPage"] : "NewsArticle",
            ...(kind === "anonymous" ? {} : { "@id": `#story-${i}` }),
            headline: `Story ${i}`,
          })),
        }),
      );
      expect(result).toMatchObject({ title: "Latest stories", type: "webpage" });
    },
  );

  it("normalizes fragment-bearing page URLs and array-valued work URLs", () => {
    const document = new DOMParser().parseFromString(
      linked({
        ...story(1),
        url: [pageUrl],
        headline: "The actual work",
      }),
      "text/html",
    );
    const result = resolveCitation({
      claims: pageClaims(document, `${pageUrl}#section`, observedAt).claims,
    });
    expect(result.citation?.["title"]).toBe("The actual work");
  });

  it.each(["url", "@id", "mainEntityOfPage"])(
    "keeps the page's work among recommendations using %s",
    (key) => {
      const work = {
        ...story(99),
        headline: "The captured work",
        [key]: key === "mainEntityOfPage" ? { "@id": pageUrl } : pageUrl,
      };
      const result = citation(
        linked({ "@graph": [...Array.from({ length: 30 }, (_, i) => story(i)), work] }),
      );
      expect(result).toMatchObject({ title: "The captured work", DOI: "10.1234/story99" });
    },
  );

  it("follows a WebPage mainEntity reference across scripts, retaining referenced authors", () => {
    const result = citation(
      [
        linked({ "@type": "WebPage", "@id": pageUrl, mainEntity: { "@id": "#work" } }),
        linked({
          "@graph": [
            ...Array.from({ length: 30 }, (_, i) => story(i)),
            {
              ...story(99),
              "@id": "#work",
              headline: "The captured work",
              author: { "@id": "#author" },
            },
            { "@type": "Person", "@id": "#author", name: "Ada Lovelace" },
          ],
        }),
      ].join(""),
    );
    expect(result).toMatchObject({
      title: "The captured work",
      author: [{ given: "Ada", family: "Lovelace" }],
    });
  });

  it("uses the canonical page identity without treating all URLs on its host as the work", () => {
    const result = citation(
      `<link rel="canonical" href="/article">${linked({
        "@graph": [
          ...Array.from({ length: 30 }, (_, i) => story(i)),
          { ...story(99), "@id": "https://news.example/article#work", headline: "Canonical work" },
        ],
      })}`,
    );
    expect(result?.["title"]).toBe("Canonical work");
  });

  it("does not take a DOI from a discarded scholarly list entry", () => {
    const result = batch(
      linked({
        "@graph": [
          { "@type": "ItemList" },
          {
            "@type": "ScholarlyArticle",
            headline: "Other paper",
            identifier: "10.1234/other",
            url: "/other",
          },
        ],
      }),
    );
    expect(result.identifiers).toBeUndefined();
    expect(resolveCitation({ claims: result.claims }).citation?.["title"]).toBe("Latest stories");
  });
});

describe("bounded untrusted metadata", () => {
  it("falls back to document evidence rather than taking the first node of an oversized graph", () => {
    const result = citation(
      linked({
        "@graph": Array.from({ length: 5_000 }, (_, i) => ({
          "@type": "NewsArticle",
          headline: `Story ${i}`,
        })),
      }),
    );
    expect(result).toMatchObject({ title: "Latest stories", type: "webpage" });
  });

  it("bounds script bytes and script count without losing the HTML fallback", () => {
    expect(
      citation(
        linked({ "@type": "NewsArticle", headline: "Story 0", description: "x".repeat(2_000_001) }),
      )?.["title"],
    ).toBe("Latest stories");
    expect(
      citation(Array.from({ length: 40 }, (_, i) => linked(story(i))).join(""))?.["title"],
    ).toBe("Latest stories");
  });

  it("reserves HTML evidence and bounds huge value arrays and repeated meta tags", () => {
    const result = batch(
      linked({
        "@type": "NewsArticle",
        headline: Array.from({ length: 10_000 }, (_, i) => `Story ${i}`),
      }) +
        Array.from({ length: 2_000 }, (_, i) => `<meta name="dc.title" content="Tag ${i}">`).join(
          "",
        ),
    );
    const titles = result.claims.filter(({ field }) => field === "title");
    expect(titles.length).toBeLessThanOrEqual(128);
    expect(titles.some(({ value }) => value === "Latest stories")).toBe(true);
  });
});

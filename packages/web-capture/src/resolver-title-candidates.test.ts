// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { pageClaims } from "./page-claims.js";
import { resolveCitation } from "./resolver.js";

import type { Claim, ClaimSource } from "./claims.js";

const observedAt = "2026-10-23T12:00:00Z";
function resolve(
  head: string,
  body = "",
  remote: Claim[] = [],
): ReturnType<typeof resolveCitation> {
  const document = new DOMParser().parseFromString(
    `<html><head>${head}</head><body>${body}</body></html>`,
    "text/html",
  );
  return resolveCitation({
    claims: [...pageClaims(document, "https://example.org/story", observedAt).claims, ...remote],
  });
}

describe("title candidates", () => {
  it.each<ClaimSource>([
    { kind: "registry", name: "doi.org" },
    { kind: "site-adapter", name: "translator" },
    { kind: "generic-remote", name: "citoid" },
    { kind: "page", signal: "json-ld" },
    { kind: "page", signal: "highwire" },
    { kind: "page", signal: "dublin-core" },
    { kind: "user" },
  ])("never splits a $kind title", (source) => {
    const title = "Machine learning - a probabilistic perspective";
    const result = resolveCitation({
      claims: [{ field: "title", value: title, source, observedAt, evidence: "name" }],
    });
    expect(result.citation).toEqual({ type: "webpage", title });
    expect(result.provenance).not.toHaveProperty("container-title");
  });

  it("preserves a published section prefix omitted by the registry when heading and work metadata agree", () => {
    const title = "Commentary: A detailed study of research practices";
    const registry: Claim = {
      field: "title",
      value: "A detailed study of research practices",
      source: { kind: "registry", name: "doi.org" },
      observedAt,
    };
    const result = resolve(
      `<title>${title}</title><meta name="citation_title" content="${title}">`,
      `<h1>${title}</h1>`,
      [registry],
    );
    expect(result.citation?.["title"]).toBe(title);
    expect(result.provenance["title"]?.source).toBe("page:highwire citation_title");
    expect(
      resolve(`<title>${title}</title>`, `<h1>${title}</h1>`, [registry]).citation?.["title"],
    ).toBe(registry.value);
  });

  it("keeps a full JSON-LD headline and name with a dash", () => {
    const title = "Ukraine — the war one year on";
    expect(
      resolve(
        `<title>${title}</title><script type="application/ld+json">${JSON.stringify({
          "@type": "NewsArticle",
          headline: title,
          name: title,
        })}</script>`,
      ).citation?.["title"],
    ).toBe(title);
  });

  it("keeps full page titles when the heading corroborates the subtitle", () => {
    expect(
      resolve(
        `<title>A story - A subtitle</title>
      <meta property="og:title" content="A story - A subtitle">`,
        "<h1>A story - A subtitle</h1>",
      ).citation?.["title"],
    ).toBe("A story - A subtitle");
  });

  it("strips the confirmed site suffix without dropping an uncorroborated subtitle", () => {
    const result = resolve(
      '<title>Machine learning - a probabilistic perspective | Example Press</title><meta property="og:site_name" content="Example Press">',
    );
    expect(result.citation).toMatchObject({
      title: "Machine learning - a probabilistic perspective",
      "container-title": "Example Press",
    });
  });

  it("does not treat identical title and OG copies as proof that a subtitle is a site", () => {
    const result = resolve(
      '<title>War — A History</title><meta property="og:title" content="War — A History">',
    );
    expect(result.citation?.["title"]).toBe("War — A History");
    expect(result.citation).not.toHaveProperty("container-title");
  });

  it("does not invent a container from an unsupported subtitle", () => {
    expect(resolve("<title>A story - A subtitle</title>").citation).toMatchObject({
      title: "A story - A subtitle",
    });
    expect(resolve("<title>A story - A subtitle</title>").citation).not.toHaveProperty(
      "container-title",
    );
  });
});

describe("page title suffix evidence", () => {
  it("does not double-count the title suffix or let generic types outvote NewsArticle", () => {
    const result = resolve(`<title>Big story - Opinion</title>
      <meta property="og:type" content="article">
      <meta property="article:published_time" content="2026-10-23">
      <meta property="og:site_name" content="The Guardian">
      <script type="application/ld+json">{"@type":"NewsArticle","headline":"Big story"}</script>`);
    expect(result.citation).toMatchObject({
      type: "article-newspaper",
      title: "Big story",
      "container-title": "The Guardian",
    });
    expect(result.provenance["container-title"]).toEqual({
      value: "The Guardian",
      source: "page:open-graph og:site_name",
    });
  });

  it("strips multiple navigation suffixes when the work heading corroborates it", () => {
    const result = resolve(
      `<title>Array.prototype.map() - JavaScript | MDN</title>
      <meta property="og:title" content="Array.prototype.map() - JavaScript | MDN">
      <meta property="og:site_name" content="MDN Web Docs">`,
      "<h1>Array.prototype.map()</h1>",
      [
        {
          field: "title",
          value: "Array.prototype.map() - JavaScript | MDN",
          source: { kind: "generic-remote", name: "citoid" },
          observedAt,
        },
      ],
    );
    expect(result.citation).toMatchObject({
      title: "Array.prototype.map()",
      "container-title": "MDN Web Docs",
    });
  });

  it("reads a graph WebSite name as a container, never as a work title or publisher", () => {
    const result = resolve(`<title>Storm hits coast - Example News</title>
      <script type="application/ld+json">{"@graph":[
        {"@type":"WebSite","name":"Example News"},
        {"@type":"NewsArticle","headline":"Storm hits coast"}
      ]}</script>`);
    expect(result.citation).toMatchObject({
      title: "Storm hits coast",
      "container-title": "Example News",
    });
    expect(result.citation).not.toHaveProperty("publisher");
  });

  it("retains a corroborated publication suffix, not intermediate section names", () => {
    expect(
      resolve(
        `<title>Storm hits coast | World news | The Guardian</title>
      <meta property="og:title" content="Storm hits coast | World news | The Guardian">
      <meta property="og:site_name" content="The Guardian">`,
        "<h1>Storm hits coast</h1>",
      ).citation,
    ).toMatchObject({ title: "Storm hits coast", "container-title": "The Guardian" });
  });
});

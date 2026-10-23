// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { pageClaims } from "./page-claims.js";
import { zoteroItemClaims } from "./provider-claims.js";
import { resolveCitation } from "./resolver.js";

import type { Claim, Resolution } from "./claims.js";

const observedAt = "2026-10-23T00:00:00Z";

function documentOf(head = "", body = ""): Document {
  return new DOMParser().parseFromString(
    `<html><head><title>A reference work</title>${head}</head><body>${body}</body></html>`,
    "text/html",
  );
}

function citation(document: Document, url = "https://notes.example/essay"): Resolution["citation"] {
  return resolveCitation({ claims: pageClaims(document, url, observedAt).claims }).citation;
}

const githubHead = `
  <meta property="og:site_name" content="GitHub">
  <meta property="og:title" content="GitHub - acme/widgets: Small reusable widgets">`;

const mdnUrl = "https://developer.mozilla.org/en-GB/docs/Web/API/Window/fetch";
const mdnHead = '<meta name="og:site_name" content="MDN Web Docs">';
const mdnBody = `<h1>fetch()</h1>
  <p class="article-footer__last-modified">This page was last modified on
    <time datetime="2025-03-06T12:00:00Z">Mar 6, 2025</time> by
    <a href="/en-GB/docs/Web/API/Window/fetch/contributors.txt">MDN contributors</a>.
  </p>`;

describe("GitHub repository convention", () => {
  it("cites the root repository, not its SEO description or README heading", () => {
    const document = documentOf(githubHead, "<h1>Widgets for everyone</h1>");
    const result = citation(document, "https://github.com/acme/widgets");
    expect(result).toMatchObject({ type: "software", title: "acme/widgets" });
    expect(result?.["author"]).toBeUndefined();
    const claims = pageClaims(document, "https://github.com/acme/widgets", observedAt).claims;
    expect(claims).toContainEqual({
      field: "title",
      value: "acme/widgets",
      source: { kind: "site-adapter", name: "github/repository" },
      evidence: "repository root + og:title",
      observedAt,
    });
  });

  it("retains explicit creator metadata instead of inventing an author from the namespace", () => {
    expect(
      citation(
        documentOf(`${githubHead}<meta name="author" content="Jane Doe">`),
        "https://github.com/acme/widgets/",
      ),
    ).toMatchObject({
      type: "software",
      author: [{ family: "Doe", given: "Jane" }],
    });
  });

  it.each([
    "https://github.com/acme/widgets/issues/1",
    "https://github.com/acme/widgets/tree/main",
    "https://github.com/acme",
    "https://github.com/topics/widgets",
    "https://github.com.evil.example/acme/widgets",
    "https://example.org/acme/widgets",
  ])("does not treat %s as the repository", (url) => {
    expect(citation(documentOf(githubHead), url)?.type).toBe("webpage");
  });

  it.each([
    githubHead.replace("acme/widgets:", "other/project:"),
    githubHead.replace("GitHub - ", "An article about "),
    githubHead.replace('content="GitHub"', 'content="A different site"'),
    "",
  ])("requires matching platform metadata (%s)", (head) => {
    expect(citation(documentOf(head), "https://github.com/acme/widgets")?.type).toBe("webpage");
  });
});

describe("MDN reference convention", () => {
  it("credits the document contributors, publisher and revision date", () => {
    expect(citation(documentOf(mdnHead, mdnBody), mdnUrl)).toMatchObject({
      author: [{ literal: "MDN contributors" }],
      publisher: "Mozilla",
      issued: { "date-parts": [[2025, 3, 6]] },
    });
  });

  it("keeps an explicit publication date instead of the last-modified fallback", () => {
    expect(
      citation(documentOf(`${mdnHead}<meta name="date" content="2021-02-03">`, mdnBody), mdnUrl)?.[
        "issued"
      ],
    ).toEqual({ "date-parts": [[2021, 2, 3]] });
    const linked =
      '<script type="application/ld+json">{"@type":"TechArticle","datePublished":"2020-01-02"}</script>';
    expect(citation(documentOf(mdnHead + linked, mdnBody), mdnUrl)?.["issued"]).toEqual({
      "date-parts": [[2020, 1, 2]],
    });
  });

  it.each([
    "https://developer.mozilla.org/en-GB/blog/a-post",
    "https://developer.mozilla.org/en-GB/",
    "https://developer.mozilla.org.evil.example/en-GB/docs/Web/API/Window/fetch",
    "https://docs.example/en-GB/docs/Web/API/Window/fetch",
  ])("does not apply MDN attribution to %s", (url) => {
    const result = citation(documentOf(mdnHead, mdnBody), url);
    expect(result?.["author"]).toBeUndefined();
    expect(result?.["publisher"]).toBeUndefined();
    expect(result?.["issued"]).toBeUndefined();
  });

  it.each([
    mdnBody.replace("/Window/fetch/contributors.txt", "/Window/other/contributors.txt"),
    mdnBody.replace('href="/en-GB', 'href="https://evil.example/en-GB'),
    mdnBody.replace("MDN contributors", "Someone else"),
    mdnBody.replace("article-footer__last-modified", "a-recommendation"),
    mdnBody + mdnBody,
  ])("does not borrow a byline/date from unrelated or ambiguous markup", (body) => {
    const result = citation(documentOf(mdnHead, body), mdnUrl);
    expect(result?.["author"]).toBeUndefined();
    expect(result?.["issued"]).toBeUndefined();
  });

  it("requires the MDN reference identity, not just its URL", () => {
    expect(citation(documentOf("", mdnBody), mdnUrl)?.["publisher"]).toBeUndefined();
    expect(
      citation(documentOf(mdnHead, "<p>Not found</p>"), mdnUrl)?.["publisher"],
    ).toBeUndefined();
  });
});

describe("leading publication datelines", () => {
  it.each([
    ["<p>March 2024</p><p>The essay starts here.</p>", [[2024, 3]]],
    [
      "<table><tr><td><font>June 2023<br><br>The essay starts here.</font></td></tr></table>",
      [[2023, 6]],
    ],
    [
      "<main><h1>Notes</h1><p>Apr. 12, 2022</p><p>The essay starts here.</p></main>",
      [[2022, 4, 12]],
    ],
  ])("reads a standalone opening date without inventing precision", (body, parts) => {
    const result = citation(documentOf("", body));
    expect(result?.["issued"]).toEqual({ "date-parts": parts });
    expect(result?.["author"]).toBeUndefined();
    expect(result?.["container-title"]).toBeUndefined();
    expect(result?.type).toBe("webpage");
  });

  it.each([
    "<p>March 2024 was unusually warm.</p>",
    "<p>The essay starts here.</p><p>March 2024</p>",
    "<p>2024</p><p>The essay starts here.</p>",
    "<p>2024-03-02</p><p>The essay starts here.</p>",
    "<p>Notamonth 2024</p><p>The essay starts here.</p>",
    "<footer>March 2024</footer><p>The essay starts here.</p>",
    "<nav>March 2024</nav><p>The essay starts here.</p>",
    "<div hidden>March 2024</div><p>The essay starts here.</p>",
    "<p>Copyright March 2024</p>",
    '<a href="/archive/2024/03">March 2024</a><p>An archive entry</p>',
    "<h2>March 2024</h2><p>An archive section</p>",
    '<time itemprop="startDate" datetime="2024-03">March 2024</time><p>An event</p>',
    "<blockquote><p>March 2024</p></blockquote><p>A quotation</p>",
    "<ul><li>March 2024</li></ul><p>A list</p>",
    "<article><p>March 2024</p></article><article><p>Another post</p></article>",
  ])("does not scan incidental dates (%s)", (body) => {
    expect(citation(documentOf("", body))?.["issued"]).toBeUndefined();
  });

  it("is only a fallback and neither mutates the page nor fetches", () => {
    const document = documentOf('<meta name="date" content="2020-01">', "<p>March 2024</p>");
    const before = document.documentElement.outerHTML;
    const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network"));
    try {
      expect(citation(document)?.["issued"]).toEqual({ "date-parts": [[2020, 1]] });
      expect(document.documentElement.outerHTML).toBe(before);
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      fetcher.mockRestore();
    }
  });
});

describe("Stack Exchange question permalink convention", () => {
  function remote(url: string, overrides = {}): Claim[] {
    return zoteroItemClaims(
      { itemType: "webpage", title: "A question", url, ...overrides },
      observedAt,
    );
  }

  it.each([
    "https://stackoverflow.com/questions/12345/how-to-test",
    "https://superuser.com/questions/23456/",
    "https://askubuntu.com/questions/34567/a-question",
    "https://math.stackexchange.com/questions/45678/a-question",
    "https://math.meta.stackexchange.com/questions/45678/a-question",
    "https://es.stackoverflow.com/questions/12345/a-question",
    "https://meta.superuser.com/questions/23456/a-question",
    "https://meta.stackexchange.com/questions/45678/a-question",
  ])("recognizes successful question records on %s", (url) => {
    const claims = remote(url);
    expect(resolveCitation({ claims }).citation?.type).toBe("post");
    expect(claims).toContainEqual({
      field: "type",
      value: "post",
      source: { kind: "site-adapter", name: "stack-exchange/question" },
      evidence: "question permalink",
      observedAt,
    });
    expect(claims.some((claim) => ["author", "issued"].includes(claim.field))).toBe(false);
  });

  it.each([
    "https://stackoverflow.com/questions",
    "https://stackoverflow.com/questions/tagged/git",
    "https://stackoverflow.com/users/12345/a-user",
    "https://stackoverflow.com.evil.example/questions/12345/a-question",
    "https://notstackexchange.com/questions/12345/a-question",
    "https://example.org/questions/12345/a-question",
    "https://stackexchange.com/questions/12345/a-question",
    "file://stackoverflow.com/questions/12345/a-question",
    "not a URL",
  ])("does not classify other routes/sites as posts (%s)", (url) => {
    expect(resolveCitation({ claims: remote(url) }).citation?.type).toBe("webpage");
  });

  it("does not override explicit work types or generate an unseen title", () => {
    const url = "https://stackoverflow.com/questions/12345/a-question";
    expect(
      resolveCitation({ claims: remote(url, { itemType: "journalArticle" }) }).citation?.type,
    ).toBe("article-journal");
    expect(remote(url, { title: "" }).some((claim) => claim.source.kind === "site-adapter")).toBe(
      false,
    );
    const blocked = documentOf("", "<p>Verification required</p>");
    blocked.title = "Just a moment...";
    expect(pageClaims(blocked, url, observedAt).claims).toEqual([]);
  });
});

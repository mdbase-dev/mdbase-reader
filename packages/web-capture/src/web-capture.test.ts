// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { readFileSync } from "node:fs";

import { htmlSelectionDraft, locateHtmlTarget } from "@mdbase-reader/renderer-html";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as pageClaimModule from "./page-claims.js";
import { resolveCitation } from "./resolver.js";
import {
  WEB_CAPTURE_EXTRACTOR,
  webCaptureImport,
  type CapturedWebDocument,
} from "./web-capture.js";

const capture = (
  html: string,
  canonicalUrl = "https://example.com/article",
): CapturedWebDocument => ({
  submittedUrl: canonicalUrl,
  canonicalUrl,
  retrievedAt: "2026-08-14T00:00:00.000Z",
  html,
});

const fixture = (name: string): string => readFileSync(`src/fixtures/${name}.html`, "utf8");
const readingDocument = (bytes: Uint8Array): Document =>
  new DOMParser().parseFromString(new TextDecoder().decode(bytes), "text/html");

afterEach(() => vi.restoreAllMocks());

describe("web capture extraction", () => {
  it("parses the snapshot and extracts its ClaimBatch only once", async () => {
    const html = fixture("academic");
    const parse = vi.spyOn(DOMParser.prototype, "parseFromString");
    const claims = vi.spyOn(pageClaimModule, "pageClaims");
    const result = await webCaptureImport(capture(html));
    expect(parse.mock.calls.filter(([source]) => source === html)).toHaveLength(1);
    expect(claims).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      capture(html).canonicalUrl,
      capture(html).retrievedAt,
    );
    expect(result.claims).toBe(claims.mock.results[0]?.value);
    expect(result.scholarly.citation).toEqual(
      resolveCitation({ claims: result.claims.claims }).citation,
    );
    expect(
      result.claims.claims.every(({ observedAt }) => observedAt === capture(html).retrievedAt),
    ).toBe(true);
  });

  it("extracts the article and metadata while retaining a separate archive", async () => {
    const html = `<!doctype html><html lang="en-AU"><head><title>A useful essay</title>
      <meta name="author" content="Jane Example"><meta property="article:published_time" content="2026-08-01">
      <meta property="og:site_name" content="Example Review"></head><body>
      <nav>Account Pricing Newsletter Archive Categories</nav><article><h1>A useful essay</h1>
      <p>This is a substantial opening paragraph with enough text to identify the article as the central content.</p>
      <p>The second substantial paragraph contains the durable reading material that should survive extraction.</p></article>
      <aside>Recommended unrelated story</aside><script>bad()</script></body></html>`;
    const result = await webCaptureImport({
      submittedUrl: "https://example.com/submitted",
      canonicalUrl: "https://example.com/essay",
      retrievedAt: "2026-08-14T00:00:00.000Z",
      html,
    });
    const readable = new TextDecoder().decode(result.bytes);
    const archive = new TextDecoder().decode(result.archive.bytes);

    expect(result.title).toBe("A useful essay");
    expect(result.capture.extractor).toBe(WEB_CAPTURE_EXTRACTOR);
    expect(result.metadata).toMatchObject({
      authors: ["Jane Example"],
      published: "2026-08-01",
      language: "en-AU",
      site: "Example Review",
    });
    expect(readable).toContain("durable reading material");
    expect(readable).not.toContain("Recommended unrelated story");
    expect(readable).not.toContain("<script");
    expect(archive).toBe(html);
  });

  it("preserves scholarly precedence, original metadata, math, tables, captions and footnotes", async () => {
    const html = fixture("academic");
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const before = parsed.documentElement.outerHTML;
    const result = await webCaptureImport(capture(html), { document: parsed });
    const readable = readingDocument(result.bytes);
    expect(parsed.documentElement.outerHTML).toBe(before);
    expect(new TextDecoder().decode(result.archive.bytes)).toBe(html);
    expect(result.metadata).toMatchObject({
      authors: ["Jane Example", "Sam Researcher"],
      published: "2026-08-01",
      language: "en",
      description: "Evidence survives without rewriting the captured document.",
    });
    expect(result.scholarly).toMatchObject({
      doi: "10.1234/structures.2026",
      citation: {
        title: "Small structures, durable evidence",
        publisher: "Example University",
        "container-title": "Journal of Small Structures",
      },
    });
    expect(readable.querySelector("math")?.textContent.replace(/\s+/gu, "")).toBe("x+1");
    expect(readable.querySelector("table caption")?.textContent).toContain("Measured observations");
    expect(readable.querySelectorAll("figcaption")).toHaveLength(2);
    expect(readable.querySelector('a[href="#note-1"]')).not.toBeNull();
    expect(readable.querySelector("#note-1")?.textContent).toContain("baseline is held constant");
    expect(readable.body.textContent).toContain("Language model pre-training.");
    expect(readable.body.textContent).toContain("Language model post-training.");
    expect(readable.querySelector("pre code")?.textContent).toBe(
      "def measure(x):\n    return x + 1\n",
    );
  });

  it.each(["academic", "code-guide", "encyclopedia"])(
    "keeps highlightable text and safe HTML in %s",
    async (name) => {
      const result = await webCaptureImport(
        capture(
          fixture(name),
          name === "encyclopedia" ? "https://en.wikipedia.org/wiki/Durable_evidence" : undefined,
        ),
      );
      const readable = readingDocument(result.bytes);
      expect(result.capture.extractor).toBe(WEB_CAPTURE_EXTRACTOR);
      expect(readable.querySelector("script, nav, aside, iframe")).toBeNull();
      expect(readable.querySelector('[http-equiv="Content-Security-Policy"]')).not.toBeNull();
      document.body.innerHTML = readable.body.innerHTML;
      const paragraph = document.querySelector("article p");
      if (!paragraph) {
        throw new Error("Fixture paragraph is missing.");
      }
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const draft = htmlSelectionDraft({
        document,
        range,
        href: "[[files/example.readable.html]]",
        progression: 0.2,
      });
      expect(draft).not.toBeNull();
      expect(locateHtmlTarget(document, draft!.target)?.toString()).toBe(range.toString().trim());
      if (name === "code-guide") {
        expect(readable.querySelector("figure pre code")?.textContent).toContain(
          'let value = String::from("durable reading copy");',
        );
        expect(readable.querySelectorAll("figcaption")).toHaveLength(2);
      }
      if (name === "encyclopedia") {
        expect(readable.querySelector('a[href="#cite_note-1"]')?.textContent).toBe("[1]");
        expect(readable.querySelector("#cite_note-1")).not.toBeNull();
        expect(readable.querySelector("table")?.textContent).toContain("Complete source text");
      }
    },
  );
});

describe("offline capture extraction", () => {
  it.each([
    "https://x.com/example/status/123456789",
    "https://twitter.com/example/article/123456789",
    "https://www.reddit.com/r/example/comments/abc123/example/",
    "https://www.youtube.com/watch?v=abcdefghijk",
    "https://www.bilibili.com/video/BV1xx411c7mD/",
    "https://wiki.c2.com/?ExamplePage",
  ])("never fetches missing content from %s", async (url) => {
    const forbidden = (): never => {
      throw new Error("Extraction made a network request.");
    };
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(forbidden);
    const windowFetch = vi.spyOn(window, "fetch").mockImplementation(forbidden);
    const xhr = vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(forbidden);
    const send = vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(forbidden);
    const imported = webCaptureImport(
      capture(
        '<!doctype html><title>Local shell</title><body><script>var ytInitialPlayerResponse = {captions:{playerCaptionsTracklistRenderer:{captionTracks:[{baseUrl:"https://example.com/transcript",languageCode:"en"}]}}};</script></body>',
        url,
      ),
    );
    // X pages belong to the social-post adapter, which refuses a shell with no loaded post.
    if (/^https:\/\/(?:x|twitter)\.com\//u.test(url)) {
      await expect(imported).rejects.toThrow();
    } else {
      expect((await imported).title).toBe("Local shell");
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(windowFetch).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not fetch resources or execute scripts embedded in captured HTML", async () => {
    const forbidden = (): never => {
      throw new Error("Extraction made a network request.");
    };
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(forbidden);
    const xhr = vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(forbidden);
    const result = await webCaptureImport(
      capture(
        fixture("code-guide").replace(
          "</main>",
          '<img src="https://example.com/image.png"><iframe src="https://example.com/embed"></iframe><script>fetch("https://example.com/api")</script><p onclick="bad()"><a href="javascript:bad()">Unsafe link</a></p></main>',
        ),
      ),
    );
    const readable = readingDocument(result.bytes);
    expect(fetch).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    expect(
      readable.querySelector('script, iframe, [onclick], [src^="https:"], [href^="javascript:"]'),
    ).toBeNull();
  });
});

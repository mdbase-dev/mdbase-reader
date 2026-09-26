// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { webCaptureImport } from "./web-capture.js";

describe("web capture extraction", () => {
  it("minimizes both stored copies without dropping structured citation metadata", async () => {
    const result = await webCaptureImport({
      submittedUrl: "https://example.com/article",
      canonicalUrl: "https://example.com/article",
      retrievedAt: "2026-08-14T00:00:00.000Z",
      html: `<html><head><title>Public article</title>
        <meta name="citation_title" content="Public article">
        <meta name="citation_author" content="Example, Jane">
        <script type="application/json">{"token":"SECRET-state"}</script></head>
        <body><!-- SECRET-comment --><article data-token="SECRET-data" id="SECRET-id">
        <h1>Public article</h1><p>Public paragraph with useful reading content.</p>
        <a href="https://example.com/?token=SECRET-query" onclick="SECRET-event">Public link</a>
        <input value="SECRET-input"><textarea>SECRET-textarea</textarea>
        <div contenteditable>SECRET-editable</div><div hidden>SECRET-hidden</div>
        <div aria-hidden="true">SECRET-aria</div><div style="display: none">SECRET-style</div>
        <template>SECRET-template</template><svg><text>SECRET-svg</text></svg>
        <img src="https://example.com/SECRET-image" srcset="SECRET-srcset">
        <x-widget private-key="SECRET-custom">Public component text</x-widget>
        </article></body></html>`,
    });
    for (const bytes of [result.bytes, result.archive.bytes]) {
      const text = new TextDecoder().decode(bytes);
      expect(text).not.toContain("SECRET-");
      expect(text).toContain("Public paragraph");
      expect(text).toContain("Public link");
      expect(text).toContain("Public component text");
    }
    expect(result.scholarly.citation?.["title"]).toBe("Public article");
    expect(result.metadata.authors).toContain("Jane Example");
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
    expect(result.metadata).toMatchObject({
      authors: ["Jane Example"],
      published: "2026-08-01",
      language: "en-AU",
      site: "Example Review",
    });
    expect(readable).toContain("durable reading material");
    expect(readable).not.toContain("Recommended unrelated story");
    expect(readable).not.toContain("<script");
    expect(archive).toContain("Recommended unrelated story");
    expect(archive).not.toContain("<script");
    expect(archive).not.toContain("bad()");
  });
});

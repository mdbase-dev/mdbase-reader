// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { webCaptureImport } from "./web-capture.js";

describe("web capture extraction", () => {
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
    expect(archive).toBe(html);
  });
});

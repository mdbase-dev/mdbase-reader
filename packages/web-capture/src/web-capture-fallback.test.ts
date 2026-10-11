// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import {
  WEB_CAPTURE_EXTRACTOR,
  webCaptureImport,
  type CapturedWebDocument,
} from "./web-capture.js";

const { output } = vi.hoisted(() => ({ output: { content: "<p>Only the opening survived.</p>" } }));
vi.mock("defuddle", () => ({
  default: class {
    parse(): { readonly content: string; readonly title: string } {
      return { ...output, title: "A clipped article" };
    }
  },
}));

const paragraph =
  "The preserved article discusses a reproducible observation and explains its implications for later research. Its evidence belongs in the reading copy so readers can select and annotate the full passage without losing important context. ";
const html = `<!doctype html><title>A complete article</title><article><h1>A complete article</h1>${Array.from({ length: 20 }, (_, i) => `<p>Observation ${String(i)}. ${paragraph.repeat(2)}</p>`).join("")}</article>`;
const capture = (source: string): CapturedWebDocument => ({
  submittedUrl: "https://example.com/article",
  canonicalUrl: "https://example.com/article",
  retrievedAt: "2026-08-14T00:00:00.000Z",
  html: source,
});

describe("short extraction safety fallback", () => {
  it("recovers substantially more text with Readability and records the actual extractor", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("Network request");
    });
    try {
      const result = await webCaptureImport(capture(html));
      expect(result.capture.extractor).toBe("mozilla-readability@0.6.0");
      expect(new TextDecoder().decode(result.bytes)).toContain("Observation 19.");
      expect(new TextDecoder().decode(result.archive.bytes)).toBe(html);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });

  it("does not replace an ordinary short page", async () => {
    const result = await webCaptureImport(
      capture("<!doctype html><title>Short note</title><p>A brief note.</p>"),
    );
    expect(result.capture.extractor).toBe(WEB_CAPTURE_EXTRACTOR);
  });

  it("does not switch merely because the page has a large navigation menu", async () => {
    const result = await webCaptureImport(
      capture(`<!doctype html><nav>${paragraph.repeat(40)}</nav><p>A brief note.</p>`),
    );
    expect(result.capture.extractor).toBe(WEB_CAPTURE_EXTRACTOR);
  });

  it("keeps Defuddle when Readability cannot recover substantially more", async () => {
    const prior = output.content;
    output.content = `<p>${paragraph.repeat(35)}</p>`;
    try {
      const result = await webCaptureImport(
        capture(`${html}<aside><a href="/related">${paragraph.repeat(50)}</a></aside>`),
      );
      expect(result.capture.extractor).toBe(WEB_CAPTURE_EXTRACTOR);
    } finally {
      output.content = prior;
    }
  });
});

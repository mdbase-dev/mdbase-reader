// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pageAnnotations } from "./page-annotations.js";
import { capturePage, watchSelection } from "./page-capture.js";

import type { LiveWebCapture } from "@mdbase-reader/web-capture";

function htmlSnapshot(): LiveWebCapture {
  const snapshot = capturePage();
  if ("pdf" in snapshot) {
    throw new Error("Expected an HTML page");
  }
  return snapshot;
}

describe("extension page capture", () => {
  beforeEach(() => {
    window.location.href = "https://example.com/story?utm_source=test#section";
    document.head.innerHTML =
      '<title>A story</title><link rel="canonical" href="https://example.com/story">';
    document.body.innerHTML =
      '<main><article><p>The exact durable quotation appears here.</p></article><form><input value="private"><textarea>draft</textarea></form></main>';
  });
  afterEach(() => vi.unstubAllGlobals());

  it("captures the current DOM without form values and normalizes its URLs", () => {
    const captured = htmlSnapshot();
    expect(captured).toMatchObject({
      submittedUrl: "https://example.com/story?utm_source=test",
      canonicalUrl: "https://example.com/story",
      pageTitle: "A story",
    });
    expect(captured.html).toContain("durable quotation");
    expect(captured.html).not.toContain("private");
    expect(captured.html).not.toContain("draft");
  });

  it("includes text rendered inside open shadow roots, with slotted content in place", () => {
    const host = document.createElement("article-body");
    host.innerHTML = '<span slot="byline">By Ada</span>Light paragraph text.';
    host.attachShadow({ mode: "open" }).innerHTML =
      '<style>p{}</style><h2>Shadow heading</h2><slot name="byline"></slot><p>Shadow paragraph. <slot></slot></p>';
    document.querySelector("article")?.append(host);
    const { html } = htmlSnapshot();
    expect(html).toContain("Shadow heading");
    expect(html).toMatch(
      /<h2>Shadow heading<\/h2><span slot="byline">By Ada<\/span><p>Shadow paragraph\. Light paragraph text\.<\/p>/u,
    );
    expect(html).not.toContain("<slot");
    expect(html).not.toContain("p{}");
  });

  it("recognises a PDF open in Chrome's viewer instead of serializing its wrapper", () => {
    Object.defineProperty(document, "contentType", {
      value: "application/pdf",
      configurable: true,
    });
    try {
      expect(capturePage()).toEqual({
        pdf: true,
        url: "https://example.com/story?utm_source=test",
        title: "A story",
      });
    } finally {
      Object.defineProperty(document, "contentType", { value: "text/html", configurable: true });
    }
  });

  it("renders only uniquely anchored quotations", () => {
    document.body.innerHTML =
      "<p>The exact durable quotation appears here.</p><p>Repeated quote.</p><p>Repeated quote.</p>";
    expect(
      pageAnnotations({
        action: "locate",
        quotes: [{ exact: "exact durable quotation" }, { exact: "Repeated quote" }],
      }).report,
    ).toEqual({ total: 2, shown: 1, missing: 0, ambiguous: 1 });
  });

  it("notifies the panel of new selections once, even when injected twice", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(() => Promise.resolve());
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    watchSelection();
    watchSelection();
    const text = document.querySelector("p")!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 9);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    await vi.advanceTimersByTimeAsync(400);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({ type: "mdbase-reader/selection" });
    vi.useRealTimers();
  });
});

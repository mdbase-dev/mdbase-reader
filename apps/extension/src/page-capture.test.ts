// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";

import { capturePage, markQuotes } from "./page-capture.js";

describe("extension page capture", () => {
  beforeEach(() => {
    window.location.href = "https://example.com/story?utm_source=test#section";
    document.head.innerHTML =
      '<title>A story</title><link rel="canonical" href="https://example.com/story">';
    document.body.innerHTML =
      '<main><article><p>The exact durable quotation appears here.</p></article><form><input value="private"><textarea>draft</textarea></form></main>';
  });

  it("captures the current DOM without form values and normalizes its URLs", () => {
    const captured = capturePage();
    expect(captured).toMatchObject({
      submittedUrl: "https://example.com/story?utm_source=test",
      canonicalUrl: "https://example.com/story",
      pageTitle: "A story",
    });
    expect(captured.html).toContain("durable quotation");
    expect(captured.html).not.toContain("private");
    expect(captured.html).not.toContain("draft");
  });

  it("renders only uniquely anchored quotations", () => {
    document.body.innerHTML =
      "<p>The exact durable quotation appears here.</p><p>Repeated quote.</p><p>Repeated quote.</p>";
    expect(markQuotes([{ exact: "exact durable quotation" }, { exact: "Repeated quote" }])).toBe(1);
    expect(document.querySelector("mark[data-mdbase-reader-annotation]")?.textContent).toBe(
      "exact durable quotation",
    );
  });
});

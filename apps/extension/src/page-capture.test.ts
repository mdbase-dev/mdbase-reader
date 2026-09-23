// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";

import { pageAnnotations } from "./page-annotations.js";
import { capturePage } from "./page-capture.js";

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
    expect(
      pageAnnotations({
        action: "locate",
        quotes: [{ exact: "exact durable quotation" }, { exact: "Repeated quote" }],
      }).report,
    ).toEqual({ total: 2, shown: 1, missing: 0, ambiguous: 1 });
  });
});

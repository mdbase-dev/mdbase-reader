// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { htmlSelectionDraft, locateHtmlTarget } from "./html-range.js";

describe("HTML ranges", () => {
  it("captures quotation context and a stable CSS selector", () => {
    document.body.innerHTML = `<article id="essay"><p>Before selected passage after.</p></article>`;
    const text = document.querySelector("p")?.firstChild;
    if (!text) {
      throw new Error("Fixture text is missing.");
    }
    const range = document.createRange();
    range.setStart(text, 7);
    range.setEnd(text, 23);

    const draft = htmlSelectionDraft({
      document,
      range,
      href: "[[files/essay.html]]",
      progression: 0.4,
    });

    expect(draft).toMatchObject({
      target: {
        quote: { exact: "selected passage", prefix: "Before ", suffix: " after." },
        html: { css: "#essay > p:nth-of-type(1)" },
      },
      locator: { kind: "html", href: "[[files/essay.html]]", progression: 0.4 },
    });
  });

  it("re-anchors duplicate quotations using their context", () => {
    document.body.innerHTML = `<main><p>First repeated phrase ending.</p><p>Second repeated phrase here.</p></main>`;
    const range = locateHtmlTarget(document, {
      quote: { exact: "repeated phrase", prefix: "Second ", suffix: " here." },
      html: { css: "main" },
    });

    expect(range?.toString()).toBe("repeated phrase");
    expect(range?.startContainer.parentElement?.textContent).toContain("Second");
  });
});

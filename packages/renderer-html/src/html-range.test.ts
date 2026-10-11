// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { htmlSelectionDraft, locateHtmlTarget } from "./html-range.js";

describe("HTML ranges", () => {
  it("anchors identical post passages to their thread part, including quoted context", () => {
    document.body.innerHTML =
      '<article><section data-post-id="100"><p>Same passage</p><blockquote><section data-post-id="quoted"><p>Quoted passage</p></section></blockquote></section><section data-post-id="101"><p>Same passage</p><blockquote><section data-post-id="quoted"><p>Quoted passage</p></section></blockquote></section></article>';
    const second = document.querySelector('[data-post-id="101"] > p')!;
    const range = document.createRange();
    range.selectNodeContents(second);
    const draft = htmlSelectionDraft({ document, range, href: "post.html", progression: 0.5 });
    expect(draft?.target.html?.css).toBe('[data-post-id="101"]');
    expect(locateHtmlTarget(document, draft!.target)?.startContainer.parentElement).toBe(second);
    range.selectNodeContents(document.querySelector('[data-post-id="101"] blockquote p')!);
    const quoted = htmlSelectionDraft({ document, range, href: "post.html", progression: 0.5 });
    expect(quoted?.target.html?.css).toBe('[data-post-id="101"]');
    expect(
      locateHtmlTarget(document, quoted!.target)?.startContainer.parentElement?.closest(
        '[data-post-id="101"]',
      ),
    ).not.toBeNull();
  });
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

  it("records context across neighbouring blocks", () => {
    document.body.innerHTML = `<main><p>Previous block</p><p>Selected block</p><p>Following block</p></main>`;
    const text = document.querySelectorAll("p").item(1).firstChild;
    if (!text) {
      throw new Error("Fixture text is missing.");
    }
    const range = document.createRange();
    range.selectNodeContents(text);

    const draft = htmlSelectionDraft({
      document,
      range,
      href: "[[files/essay.html]]",
      progression: 0.5,
    });

    expect(draft?.target).toEqual({
      quote: { exact: "Selected block", prefix: "Previous block", suffix: "Following block" },
      html: { css: "body > main:nth-of-type(1) > p:nth-of-type(2)" },
    });
  });
});

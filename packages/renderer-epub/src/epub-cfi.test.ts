// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { epubSelectionEvidence } from "./epub-cfi.js";

describe("epubSelectionEvidence", () => {
  it("encodes a same-node selection as a package-qualified range CFI", () => {
    document.body.innerHTML = `<main><p>Before selected passage after</p></main>`;
    const text = document.querySelector("p")?.firstChild;
    if (!text) {
      throw new Error("fixture text is missing");
    }
    const range = document.createRange();
    range.setStart(text, 7);
    range.setEnd(text, 23);

    expect(epubSelectionEvidence(range, 1)).toEqual({
      cfi: "epubcfi(/6/4!/4/2/2,/1:7,/1:23)",
      prefix: "Before",
      suffix: "after",
    });
  });

  it("encodes a range spanning separate elements", () => {
    document.body.innerHTML = `<section><p>Alpha</p><p>Omega</p></section>`;
    const paragraphs = document.querySelectorAll("p");
    const start = paragraphs.item(0).firstChild;
    const end = paragraphs.item(1).firstChild;
    if (!start || !end) {
      throw new Error("fixture text is missing");
    }
    const range = document.createRange();
    range.setStart(start, 2);
    range.setEnd(end, 3);

    expect(epubSelectionEvidence(range, 0)?.cfi).toBe("epubcfi(/6/2!/4/2,/2/1:2,/4/1:3)");
  });

  it("rejects collapsed and invalid spine selections", () => {
    document.body.textContent = "Nothing selected";
    const text = document.body.firstChild;
    if (!text) {
      throw new Error("fixture text is missing");
    }
    const range = document.createRange();
    range.setStart(text, 2);
    range.collapse(true);

    expect(epubSelectionEvidence(range, 0)).toBeNull();
    range.setEnd(text, 5);
    expect(epubSelectionEvidence(range, -1)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { annotationBodyText, appendAnnotationQuoteFooter } from "../index.js";

describe("annotationBodyText", () => {
  it("treats the first blockquote as the curated quotation", () => {
    expect(
      annotationBodyText(
        "> A corrected quotation\n> across two lines.\n>\n> A second paragraph.\n\nMy note.",
      ),
    ).toEqual({
      quote: "A corrected quotation\nacross two lines.\n\nA second paragraph.",
      note: "My note.",
    });
  });

  it("leaves later blockquotes in the commentary", () => {
    expect(annotationBodyText("> Primary quote.\n\nA comparison:\n\n> Secondary quote.")).toEqual({
      quote: "Primary quote.",
      note: "A comparison:\n\n> Secondary quote.",
    });
  });

  it("does not mistake quoted-looking text inside a code fence for a quotation", () => {
    expect(annotationBodyText("```md\n> example\n```\n\nCommentary only.")).toEqual({
      quote: null,
      note: "```md\n> example\n```\n\nCommentary only.",
    });
  });

  it("understands a lazy blockquote continuation", () => {
    expect(annotationBodyText("> First line\ncontinued line\n\nCommentary.")).toEqual({
      quote: "First line\ncontinued line",
      note: "Commentary.",
    });
  });
});

describe("appendAnnotationQuoteFooter", () => {
  it("adds a footer to the first blockquote wherever it occurs", () => {
    expect(
      appendAnnotationQuoteFooter(
        "![[files/capture.png]]\n\n> Curated quote.\n\nCommentary.",
        "— [@source, p. 4]",
      ),
    ).toBe("![[files/capture.png]]\n\n> Curated quote.\n>\n> — [@source, p. 4]\n\nCommentary.");
  });

  it("returns null when the author removed the quotation", () => {
    expect(appendAnnotationQuoteFooter("Commentary only.", "— [@source]")).toBeNull();
  });
});

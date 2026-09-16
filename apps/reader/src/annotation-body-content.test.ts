import { describe, expect, it } from "vitest";

import { annotationBodyContent } from "./annotation-body-content.js";

describe("annotationBodyContent", () => {
  it("extracts screenshot embeds while retaining the annotation note", () => {
    expect(
      annotationBodyContent(
        "![[files/annotation-ann_01.png|Diagram detail]]\n\nA useful contradiction.",
      ),
    ).toEqual({
      images: [{ path: "files/annotation-ann_01.png", alt: "Diagram detail" }],
      quote: null,
      note: "A useful contradiction.",
    });
  });

  it("does not treat non-image transclusions as screenshot assets", () => {
    expect(annotationBodyContent("![[annotations/related]]\n\nCompare these passages.")).toEqual({
      images: [],
      quote: null,
      note: "![[annotations/related]]\n\nCompare these passages.",
    });
  });

  it("uses the first authored blockquote as the displayed quotation", () => {
    expect(
      annotationBodyContent(
        "> User-corrected quotation.\n\nA note.\n\n> A comparison kept in the note.",
      ),
    ).toEqual({
      images: [],
      quote: "User-corrected quotation.",
      note: "A note.\n\n> A comparison kept in the note.",
    });
  });
});

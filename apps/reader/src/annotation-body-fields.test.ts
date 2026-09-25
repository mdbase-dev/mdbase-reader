import { describe, expect, it } from "vitest";

import { annotationBodyFields, annotationBodyWithFields } from "./annotation-body-fields.js";

const highlight = "> Attention consists of suspending\n> our thought.\n\nThe practical core.";

describe("annotationBodyFields", () => {
  it("separates a highlight's quotation from its comment", () => {
    expect(annotationBodyFields(highlight)).toEqual({
      structured: true,
      quote: "Attention consists of suspending\nour thought.",
      comment: "The practical core.",
    });
  });

  it("shows the selected text when an older record keeps it only in the selector", () => {
    expect(annotationBodyFields("Only a comment.", "Selected text")).toEqual({
      structured: true,
      quote: "Selected text",
      comment: "Only a comment.",
    });
  });

  it("keeps an area crop out of the editable comment", () => {
    expect(annotationBodyFields("![[files/annotation-a.png]]\n\nA figure.")).toEqual({
      structured: true,
      quote: null,
      comment: "A figure.",
    });
  });

  it("falls back to raw Markdown when text precedes the quotation", () => {
    expect(annotationBodyFields("Intro\n\n> Quote").structured).toBe(false);
  });
});

describe("annotationBodyWithFields", () => {
  it("returns the body unchanged when nothing was edited", () => {
    const body = ">   Oddly spaced quote\n\n\nComment";
    expect(annotationBodyWithFields(body, annotationBodyFields(body))).toBe(body);
  });

  it("keeps the quotation's Markdown when only the comment changes", () => {
    expect(
      annotationBodyWithFields(highlight, {
        quote: "Attention consists of suspending\nour thought.",
        comment: "A new comment.",
      }),
    ).toBe("> Attention consists of suspending\n> our thought.\n\nA new comment.");
  });

  it("rewrites a corrected quotation as a blockquote", () => {
    expect(
      annotationBodyWithFields(highlight, {
        quote: "Attention consists of suspending our thought.\n\nSecond paragraph.",
        comment: "The practical core.",
      }),
    ).toBe(
      "> Attention consists of suspending our thought.\n>\n> Second paragraph.\n\nThe practical core.",
    );
  });

  it("does not write the selector fallback into the body unless it is edited", () => {
    expect(
      annotationBodyWithFields("Old comment.", { quote: "Selected", comment: "New." }, "Selected"),
    ).toBe("New.");
    expect(
      annotationBodyWithFields(
        "Old comment.",
        { quote: "Selected, corrected", comment: "Old comment." },
        "Selected",
      ),
    ).toBe("> Selected, corrected\n\nOld comment.");
  });

  it("keeps an area crop above an edited comment", () => {
    expect(
      annotationBodyWithFields("![[files/annotation-a.png]]", { quote: null, comment: "Added." }),
    ).toBe("![[files/annotation-a.png]]\n\nAdded.");
  });

  it("drops the quotation when it is cleared", () => {
    expect(annotationBodyWithFields(highlight, { quote: "", comment: "The practical core." })).toBe(
      "The practical core.",
    );
  });
});

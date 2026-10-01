import { describe, expect, it } from "vitest";

import {
  displayQuote,
  highlightBody,
  highlightComment,
  withHighlightComment,
} from "./highlight-body.js";

it("writes the passage as a blockquote followed by the comment", () => {
  expect(highlightBody("one\ntwo", "")).toBe("> one\n> two");
  expect(highlightBody("one", "A thought")).toBe("> one\n\nA thought");
});
it("reads the comment after the quote, or all of an unquoted body", () => {
  expect(highlightComment("> one\n> two\n\nFirst line\n\nSecond")).toBe("First line\n\nSecond");
  expect(highlightComment("> one")).toBe("");
  expect(highlightComment("Written in Reader")).toBe("Written in Reader");
});
it("replaces only the comment and keeps the saved quote", () => {
  expect(withHighlightComment("> one\n> two\n\nOld", "New")).toBe("> one\n> two\n\nNew");
  expect(withHighlightComment("> one\n\nOld", "  ")).toBe("> one");
  expect(withHighlightComment("> one", "Added")).toBe("> one\n\nAdded");
  expect(withHighlightComment("Written in Reader", "Changed")).toBe("Changed");
});

describe("displayQuote", () => {
  it("drops the page's indentation and wrapping but keeps paragraphs", () => {
    expect(
      displayQuote(
        "\n\n            Abstract:The dominant\n   models are based\n\n  Second  paragraph.\n    ",
      ),
    ).toBe("Abstract:The dominant models are based\n\nSecond paragraph.");
  });
});

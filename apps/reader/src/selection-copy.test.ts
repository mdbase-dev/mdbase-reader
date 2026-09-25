import { describe, expect, it } from "vitest";

import { citableLocator, citedQuote } from "./selection-copy.js";

describe("citedQuote", () => {
  it("cites with Pandoc when the source has a citekey", () => {
    expect(
      citedQuote("Attention is the rarest\nform of generosity.", {
        citekey: "weil2002",
        title: "Gravity and Grace",
        locator: "p. 16",
      }),
    ).toBe("> Attention is the rarest\n> form of generosity.\n>\n> [@weil2002, p. 16]");
  });

  it("falls back to the title without a citekey", () => {
    expect(citedQuote("A passage.", { title: "Gravity and Grace" })).toBe(
      "> A passage.\n>\n> — Gravity and Grace",
    );
  });
});

describe("citableLocator", () => {
  it("keeps page labels and drops locations others cannot follow", () => {
    expect(citableLocator("p. 16")).toBe("p. 16");
    expect(citableLocator("EPUB location")).toBeUndefined();
    expect(citableLocator("https://example.com/essay")).toBeUndefined();
  });
});

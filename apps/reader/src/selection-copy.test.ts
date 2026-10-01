import { describe, expect, it } from "vitest";

import { citableLocator, citedQuote } from "./selection-copy.js";

describe("citedQuote", () => {
  it("cites with Pandoc when the source has a citekey", () => {
    expect(
      citedQuote(
        "Pain and suffering are always inevitable\nfor a large intelligence and a deep heart.",
        {
          citekey: "dostoevsky2002",
          title: "Crime and Punishment",
          locator: "p. 16",
        },
      ),
    ).toBe(
      "> Pain and suffering are always inevitable\n> for a large intelligence and a deep heart.\n>\n> [@dostoevsky2002, p. 16]",
    );
  });

  it("falls back to the title without a citekey", () => {
    expect(citedQuote("A passage.", { title: "Crime and Punishment" })).toBe(
      "> A passage.\n>\n> — Crime and Punishment",
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

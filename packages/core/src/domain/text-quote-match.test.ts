import { describe, expect, it } from "vitest";

import { matchTextQuote, textQuoteAt, textQuoteMatcher } from "./text-quote-match.js";

function matched(text: string, quote: Parameters<typeof matchTextQuote>[1]): string | null {
  const match = matchTextQuote(text, quote);
  return match ? text.slice(match.start, match.end) : null;
}

describe("matchTextQuote", () => {
  it("ignores whitespace, soft hyphens and zero-width characters", () => {
    expect(matched("Alpha beta\n\t gamma delta.", { exact: "beta gamma" })).toBe("beta\n\t gamma");
    // Block boundaries join text with or without whitespace, depending on the copy.
    expect(matched("ends here.Second paragraph", { exact: "here.\n  Second" })).toBe("here.Second");
    expect(matched("hyphen\u00adated word\u200b", { exact: "hyphenated word" })).toBe(
      "hyphen\u00adated word",
    );
  });

  it("uses context to choose between repeats and reports a tie as ambiguous", () => {
    const text = "first quote here; second quote there";
    expect(matchTextQuote(text, { exact: "quote" })?.ambiguous).toBe(true);
    const match = matchTextQuote(text, { exact: "quote", prefix: "second ", suffix: " there" });
    expect(match).toMatchObject({ start: 25, ambiguous: false });
    expect(
      matchTextQuote("see the model here. see the model here.", {
        exact: "the model",
        prefix: "see ",
        suffix: " here",
      })?.ambiguous,
    ).toBe(true);
  });

  it("accepts context that only partly agrees with this copy", () => {
    const text =
      "In the first study the model failed. After retraining, the model improved sharply.";
    const match = matchTextQuote(text, {
      exact: "the model",
      prefix: "Figure 2: accuracy by epoch. After retraining, ",
      suffix: " improved sharply in every trial.",
    });
    expect(match?.ambiguous).toBe(false);
    expect(text.slice(match?.end ?? 0)).toBe(" improved sharply.");
  });

  it("finds a passage when the copies differ inside it", () => {
    // The reading copy dropped a button label and a hidden span the live page still has.
    const live =
      "A third paragraph with an inline Show definition glossary toggle, and lots more text. " +
      "Fourth paragraph that is visually hidden text HIDDEN continues here, with commas.";
    const button = matchTextQuote(live, {
      exact: "A third paragraph with an inline  glossary toggle, and lots more text.",
    });
    expect(button).toMatchObject({ approximate: true, ambiguous: false });
    expect(live.slice(button?.start, button?.end)).toBe(
      "A third paragraph with an inline Show definition glossary toggle, and lots more text.",
    );
    expect(matched(live, { exact: "visually hidden text continues here" })).toBe(
      "visually hidden text HIDDEN continues here",
    );
  });

  it("does not approximate short or unrelated quotations", () => {
    expect(matchTextQuote("an ordinary sentence", { exact: "ordinary sentinel" })).toBeNull();
    expect(
      matchTextQuote("The committee approved the budget on Tuesday afternoon.", {
        exact: "The committee rejected every proposal from the minority.",
      }),
    ).toBeNull();
    expect(matchTextQuote("text", { exact: " \n" })).toBeNull();
  });

  it("keeps surrogate pairs intact", () => {
    expect(matched("Read 📖 patiently.", { exact: "📖 patiently" })).toBe("📖 patiently");
  });

  it("locates many quotations in one prepared text", () => {
    const match = textQuoteMatcher("one two three");
    expect([match({ exact: "one" })?.start, match({ exact: "three" })?.start]).toEqual([0, 8]);
  });
});

describe("textQuoteAt", () => {
  it("records the passage with up to 64 characters of context on each side", () => {
    expect(textQuoteAt("before quotation after", 7, 16)).toEqual({
      exact: "quotation",
      prefix: "before ",
      suffix: " after",
    });
    expect(textQuoteAt("x".repeat(100) + "quote", 100, 105).prefix).toHaveLength(64);
    expect(textQuoteAt("quote", 0, 5)).toEqual({ exact: "quote" });
  });
});

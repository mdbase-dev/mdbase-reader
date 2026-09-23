// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";

import { pageAnnotations } from "./page-annotations.js";

describe("live-page quote anchoring", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  it("locates ranges across markup and multiple ranges in one text node without mutating the page", () => {
    const html = "<p>Alpha beta <em>gamma delta</em> epsilon zeta.</p>";
    document.body.innerHTML = html;
    const result = pageAnnotations({
      action: "locate",
      quotes: [{ exact: "beta gamma" }, { exact: "epsilon" }],
    });
    expect(result.report).toEqual({ total: 2, shown: 2, missing: 0, ambiguous: 0 });
    expect(document.body.innerHTML).toBe(html);
  });
  it("normalizes whitespace for matching but preserves the saved exact text", () => {
    document.body.innerHTML = "<p>Alpha beta\n\t gamma delta.</p>";
    expect(
      pageAnnotations({ action: "locate", quotes: [{ exact: "beta gamma" }] }).quotes[0]?.exact,
    ).toBe("beta\n\t gamma");
  });
  it("uses context to disambiguate repeats and never guesses without it", () => {
    document.body.innerHTML = "<p>first quote here; second quote there</p>";
    const result = pageAnnotations({
      action: "locate",
      quotes: [
        { exact: "quote" },
        { exact: "quote", prefix: "second ", suffix: " there" },
        { exact: "gone" },
      ],
    });
    expect(result.report).toEqual({ total: 3, shown: 1, missing: 1, ambiguous: 1 });
    expect(result.quotes[1]?.prefix).toContain("second ");
  });
  it("ignores hidden and editable text", () => {
    document.body.innerHTML =
      "<p>public quote</p><div hidden>public quote</div><div contenteditable>private note</div>";
    expect(
      pageAnnotations({
        action: "locate",
        quotes: [{ exact: "public quote" }, { exact: "private note" }],
      }).report,
    ).toEqual({ total: 2, shown: 1, missing: 1, ambiguous: 0 });
  });
  it("captures the selected range with surrounding context", () => {
    document.body.innerHTML = "<p>before quotation after</p>";
    const range = document.createRange();
    range.setStart(document.querySelector("p")!.firstChild!, 7);
    range.setEnd(document.querySelector("p")!.firstChild!, 16);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    expect(pageAnnotations({ action: "selection" }).selection).toEqual({
      exact: "quotation",
      prefix: "before ",
      suffix: " after",
    });
  });
  it("works when Chrome serializes just the injected function", () => {
    document.body.innerHTML = "<p>A durable quote.</p>";
    // Reproduce Chrome's function-only serialization, using only our own static source.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
    const injected = new Function(
      `return (${pageAnnotations.toString()})`,
    )() as typeof pageAnnotations;
    expect(injected({ action: "locate", quotes: [{ exact: "durable quote" }] }).report.shown).toBe(
      1,
    );
  });
  it("rejects empty quotes and supports emoji without cutting surrogate pairs", () => {
    document.body.innerHTML = "<p>Read 📖 patiently.</p>";
    const result = pageAnnotations({
      action: "locate",
      quotes: [{ exact: " " }, { exact: "📖 patiently" }],
    });
    expect(result.report.shown).toBe(1);
    expect(result.quotes[1]?.exact).toBe("📖 patiently");
  });
});

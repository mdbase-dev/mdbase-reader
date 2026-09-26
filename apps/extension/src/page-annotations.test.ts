// @vitest-environment happy-dom
import { textQuoteAt, type QuoteSelector } from "@mdbase-reader/core";
import { webCaptureImport } from "@mdbase-reader/web-capture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  drawPageQuotes,
  locateQuotes,
  pageText,
  type PageQuote,
  type PageTextRequest,
} from "./page-annotations.js";

function locate(
  quotes: readonly PageQuote[],
  doc: Document = document,
): ReturnType<typeof locateQuotes> {
  return locateQuotes(pageText({ action: "text" }, doc).text ?? "", quotes);
}

describe("live-page quote anchoring", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  it("locates quotes across markup and several in one text node without mutating the page", () => {
    const html = "<p>Alpha beta <em>gamma delta</em> epsilon zeta.</p>";
    document.body.innerHTML = html;
    const result = locate([{ exact: "beta gamma" }, { exact: "epsilon" }]);
    expect(result.report).toEqual({ total: 2, shown: 2, missing: 0, ambiguous: 0 });
    expect(document.body.innerHTML).toBe(html);
  });
  it("uses context to disambiguate repeats and never guesses without it", () => {
    document.body.innerHTML = "<p>first quote here; second quote there</p>";
    const result = locate([
      { exact: "quote" },
      { exact: "quote", prefix: "second ", suffix: " there" },
      { exact: "gone" },
    ]);
    expect(result.report).toEqual({ total: 3, shown: 1, missing: 1, ambiguous: 1 });
    expect(result.outcomes).toEqual(["ambiguous", "shown", "missing"]);
    expect(result.highlights).toEqual([{ start: 25, end: 30, color: "yellow", index: 1 }]);
  });
  it("ignores hidden and editable text", () => {
    document.body.innerHTML =
      "<p>public quote</p><div hidden>public quote</div><div contenteditable>private note</div>";
    expect(locate([{ exact: "public quote" }, { exact: "private note" }]).report).toEqual({
      total: 2,
      shown: 1,
      missing: 1,
      ambiguous: 0,
    });
  });
  it("captures the selected range with surrounding context", () => {
    document.body.innerHTML = "<p>before quotation after</p>";
    const range = document.createRange();
    range.setStart(document.querySelector("p")!.firstChild!, 7);
    range.setEnd(document.querySelector("p")!.firstChild!, 16);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    expect(pageText({ action: "selection" }).selection).toEqual({
      exact: "quotation",
      prefix: "before ",
      suffix: " after",
    });
  });
  it("works when Chrome serializes just the injected function", () => {
    document.body.innerHTML = "<p>A durable quote.</p>";
    // Reproduce Chrome's function-only serialization, using only our own static source.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
    const injected = new Function(`return (${pageText.toString()})`)() as typeof pageText;
    expect(injected({ action: "text" }).text).toBe("A durable quote.");
  });
});

describe("drawing on the page", () => {
  const registry = new Map<string, unknown>();
  beforeEach(() => {
    registry.clear();
    vi.stubGlobal(
      "Highlight",
      class {
        constructor(readonly range: Range) {}
      },
    );
    Object.defineProperty(window, "CSS", { value: { highlights: registry }, configurable: true });
    vi.stubGlobal("chrome", {
      scripting: {
        executeScript: vi.fn(({ args }: { args: [PageTextRequest] }) =>
          Promise.resolve([{ result: pageText(args[0]) }]),
        ),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("draws located quotes at their offsets in the indexed text", async () => {
    document.body.innerHTML = "<p>Alpha beta <em>gamma</em> delta.</p>";
    const projection = await drawPageQuotes(
      1,
      [{ exact: "beta gamma", color: "green" }],
      location.href,
    );
    expect(projection.outcomes).toEqual(["shown"]);
    expect((registry.get("mdbase-reader-0") as { range: Range }).range.toString()).toBe(
      "beta gamma",
    );
  });

  it("refuses to draw on a page that changed after it was indexed", () => {
    document.body.innerHTML = "<p>Alpha beta.</p>";
    const { version } = pageText({ action: "text" });
    document.body.innerHTML = "<p>Changed.</p>";
    expect(pageText({ action: "render", highlights: [], version: version ?? "" }).rendered).toBe(
      false,
    );
  });
});

describe("highlights made on the saved reading copy", () => {
  // The reading copy is Readability's extraction, which drops text the live page shows.
  const live = `<!doctype html><html><head><title>Essay</title></head><body><nav>Home News</nav>
    <main><article><h1>A headline about things</h1>
    <p>The first paragraph has a sentence that ends here, with commas, and more commas, for scoring.</p>
    <p>A third paragraph with an inline <button>Show definition</button> glossary toggle, and lots more text, with commas, to be scored as content.</p>
    <p>Fourth paragraph that is visually hidden text<span style="display:none"> HIDDEN </span> continues here, with commas, commas, commas.</p>
    </article></main></body></html>`;

  it("still appear on the live page", async () => {
    const captured = await webCaptureImport({
      submittedUrl: "https://example.com/essay",
      canonicalUrl: "https://example.com/essay",
      retrievedAt: "2026-09-26T00:00:00.000Z",
      html: live,
    });
    const saved = new DOMParser().parseFromString(
      new TextDecoder().decode(captured.bytes),
      "text/html",
    );
    const savedText = pageText({ action: "text" }, saved).text ?? "";
    const passage = (from: string, to: string): QuoteSelector => {
      const start = savedText.indexOf(from);
      return textQuoteAt(savedText, start, savedText.indexOf(to, start) + to.length);
    };
    const quotes = [
      passage("with an inline", "lots more text"),
      passage("visually hidden text", "continues here"),
      passage("ends here", "A third paragraph"),
    ];
    const result = locate(quotes, new DOMParser().parseFromString(live, "text/html"));
    expect(result.outcomes).toEqual(["shown", "shown", "shown"]);
  });
});

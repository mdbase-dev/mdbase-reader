// @vitest-environment happy-dom
import {
  textQuoteAt,
  textQuoteContextLength,
  textQuoteMatcher,
  type QuoteSelector,
} from "@mdbase-reader/core";
import { webCaptureImport } from "@mdbase-reader/web-capture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  drawPageQuotes,
  pageText,
  revealPageQuote,
  type PageQuote,
  type PageTextRequest,
} from "./page-annotations.js";

const registry = new Map<string, Set<Range>>();
const executeScript = vi.fn(({ args }: { args: [PageTextRequest] }) =>
  Promise.resolve([{ result: pageText(args[0]) }]),
);
beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  registry.clear();
  executeScript.mockClear();
  vi.stubGlobal(
    "Highlight",
    class extends Set<Range> {
      constructor(...ranges: Range[]) {
        super(ranges);
      }
    },
  );
  Object.defineProperty(window, "CSS", { value: { highlights: registry }, configurable: true });
  vi.stubGlobal("chrome", { scripting: { executeScript }, tabs: { get: vi.fn() } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Draws the quotes on `document` and returns the outcomes and the text drawn for each. */
function draw(quotes: readonly PageQuote[]): {
  outcomes: readonly string[];
  report: unknown;
  drawn: string[];
} {
  const { projection } = pageText({ action: "draw", quotes });
  const drawn = [...registry]
    .filter(([name]) => name !== "mdbase-reader-focus")
    .map(([, highlight]) => [...highlight].map((range) => range.toString()).join());
  return { outcomes: projection?.outcomes ?? [], report: projection?.report, drawn };
}
function select(start: [Node, number], end: [Node, number]): void {
  const range = document.createRange();
  range.setStart(...start);
  range.setEnd(...end);
  document.getSelection()!.removeAllRanges();
  document.getSelection()!.addRange(range);
}
function selected(): QuoteSelector | null | undefined {
  return pageText({ action: "selection" }).selection;
}

describe("live-page quote anchoring", () => {
  it("locates quotes across markup and several in one text node without mutating the page", () => {
    const html = "<p>Alpha beta <em>gamma delta</em> epsilon zeta.</p>";
    document.body.innerHTML = html;
    const result = draw([{ exact: "beta gamma" }, { exact: "epsilon" }]);
    expect(result.report).toEqual({ total: 2, shown: 2, missing: 0, ambiguous: 0 });
    expect(result.drawn).toEqual(["beta gamma", "epsilon"]);
    expect(document.body.innerHTML).toBe(html);
  });
  it("uses context to disambiguate repeats and never guesses without it", () => {
    document.body.innerHTML = "<p>first quote here; second quote there</p>";
    const result = draw([
      { exact: "quote" },
      { exact: "quote", prefix: "second ", suffix: " there" },
      { exact: "gone" },
    ]);
    expect(result.report).toEqual({ total: 3, shown: 1, missing: 1, ambiguous: 1 });
    expect(result.outcomes).toEqual(["ambiguous", "shown", "missing"]);
    const [range] = [...registry.values()][0] ?? [];
    expect(range?.startOffset).toBe(25);
  });
  it("ignores hidden, editable and the extension's own text, however deeply nested", () => {
    document.body.innerHTML =
      "<p>public quote</p><div hidden><p><b>public quote</b></p></div>" +
      "<section aria-hidden='true'><div><span>hidden phrase</span></div></section>" +
      "<div contenteditable>private note</div><div data-mdbase-reader-ui>panel text</div>";
    expect(pageText({ action: "text" }).text).toBe("public quote");
    expect(
      draw([{ exact: "public quote" }, { exact: "private note" }, { exact: "hidden phrase" }])
        .outcomes,
    ).toEqual(["shown", "missing", "missing"]);
  });
  it("indexes nothing when the whole body is hidden", () => {
    document.body.setAttribute("aria-hidden", "true");
    document.body.innerHTML = "<p>covered by a dialog</p>";
    try {
      expect(pageText({ action: "text" }).text).toBe("");
    } finally {
      document.body.removeAttribute("aria-hidden");
    }
  });
  it("finds the text nodes of a passage among many, including empty ones", () => {
    const paragraph = document.createElement("p");
    for (let index = 0; index < 500; index++) {
      paragraph.append(`w${String(index)} `, "");
    }
    document.body.append(paragraph);
    expect(draw([{ exact: "w123 w124 w125" }, { exact: "w0" }, { exact: "w499" }]).drawn).toEqual([
      "w123 w124 w125",
      "w0",
      "w499",
    ]);
  });
  it("anchors exactly as Reader's matcher does", () => {
    const live =
      "A third paragraph with an inline Show definition glossary toggle, and lots more text. " +
      "Fourth paragraph that is visually hidden text HIDDEN continues here, with commas. " +
      "In the first study the model failed. After retraining, the model improved sharply. " +
      "see the model here. see the model here. Read 📖 patiently. hyphen\u00adated word\u200b";
    const quotes: PageQuote[] = [
      { exact: "A third paragraph with an inline  glossary toggle, and lots more text." },
      { exact: "visually hidden text continues here" },
      { exact: "the model", prefix: "After retraining, ", suffix: " improved" },
      { exact: "the model", prefix: "see ", suffix: " here" },
      { exact: "the model" },
      { exact: "📖 patiently" },
      { exact: "hyphenated word" },
      { exact: "ordinary sentinel" },
      { exact: " \n" },
    ];
    document.body.innerHTML = "<p></p>";
    document.querySelector("p")!.textContent = live;
    const match = textQuoteMatcher(live);
    const expected = quotes.map((quote) => {
      const found = match(quote);
      return !found ? "missing" : found.ambiguous ? "ambiguous" : "shown";
    });
    const result = draw(quotes);
    expect(result.outcomes).toEqual(expected);
    expect(result.drawn).toEqual(
      quotes.flatMap((quote) => {
        const found = match(quote);
        return found && !found.ambiguous ? [live.slice(found.start, found.end)] : [];
      }),
    );
  });
  it("works when Chrome serializes just the injected function", () => {
    document.body.innerHTML = "<p>A durable quote.</p>";
    // Reproduce Chrome's function-only serialization, using only our own static source.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
    const injected = new Function(`return (${pageText.toString()})`)() as typeof pageText;
    expect(injected({ action: "text" }).text).toBe("A durable quote.");
    expect(
      injected({ action: "draw", quotes: [{ exact: "durable" }] }).projection?.outcomes,
    ).toEqual(["shown"]);
    select(
      [document.querySelector("p")!.firstChild!, 2],
      [document.querySelector("p")!.firstChild!, 9],
    );
    expect(injected({ action: "selection" }).selection?.exact).toBe("durable");
  });
});

describe("reading the selection", () => {
  it("captures the selected range with surrounding context", () => {
    document.body.innerHTML = "<p>before quotation after</p>";
    const text = document.querySelector("p")!.firstChild!;
    select([text, 7], [text, 16]);
    expect(selected()).toEqual({ exact: "quotation", prefix: "before ", suffix: " after" });
  });
  it("records context as Reader does: the indexed text either side, up to its length", () => {
    document.body.innerHTML =
      `<p>${"lead ".repeat(30)}<script>var x = 1;</script><b>start</b> of the <i>passage</i> ends</p>` +
      `<div hidden>skipped</div><p>tail ${"more ".repeat(30)}</p>`;
    const start = document.querySelector("b")!.firstChild!;
    const end = document.querySelector("i")!.firstChild!;
    select([start, 0], [end, 7]);
    const text = pageText({ action: "text" }).text ?? "";
    const from = text.indexOf("start");
    const to = text.indexOf("passage") + "passage".length;
    expect(selected()).toEqual(textQuoteAt(text, from, to));
    expect(selected()?.prefix).toHaveLength(textQuoteContextLength);
    expect(selected()?.suffix).toMatch(/^ endstail more/u);
    expect(selected()?.suffix).toHaveLength(textQuoteContextLength);
  });
  it("handles boundaries between elements and inside excluded text", () => {
    document.body.innerHTML =
      "<p>one</p><p>two <span aria-hidden='true'>icon</span>three</p><p>four</p>";
    const [first, second, third] = document.querySelectorAll("p");
    select([first!, 1], [third!, 0]);
    expect(selected()).toEqual({ exact: "two three", prefix: "one", suffix: "four" });
    // From inside the hidden icon to the end of the second paragraph.
    select([document.querySelector("span")!.firstChild!, 2], [second!, 3]);
    expect(selected()).toEqual({ exact: "three", prefix: "onetwo ", suffix: "four" });
  });
  it("collapses the page's layout whitespace in the passage itself", () => {
    document.body.innerHTML =
      "<blockquote>\n      Abstract:   We study\n   things.\n    </blockquote>";
    const text = document.querySelector("blockquote")!.firstChild!;
    select([text, 0], [text, text.textContent!.length]);
    expect(selected()).toEqual({ exact: "Abstract: We study things." });
  });
  it("finds nothing in a selection of only excluded text or whitespace", () => {
    document.body.innerHTML = "<p>a</p><div hidden>secret</div><p>   </p>";
    const hidden = document.querySelector("div")!.firstChild!;
    select([hidden, 0], [hidden, 6]);
    expect(selected()).toBeNull();
    const blank = document.querySelectorAll("p")[1]!.firstChild!;
    select([blank, 0], [blank, 3]);
    expect(selected()).toBeNull();
  });
});

describe("drawing on the page", () => {
  it("indexes, anchors and draws in a single injection", async () => {
    document.body.innerHTML = "<p>Alpha beta <em>gamma</em> delta.</p>";
    const projection = await drawPageQuotes(
      1,
      [{ exact: "beta gamma", color: "green" }],
      location.href,
    );
    expect(projection.outcomes).toEqual(["shown"]);
    expect(executeScript).toHaveBeenCalledTimes(1);
    const [highlight] = [...registry.values()];
    expect([...(highlight ?? [])].map(String)).toEqual(["beta gamma"]);
    expect(document.querySelector("style[data-mdbase-reader-highlights]")?.textContent).toContain(
      "#83cf9988",
    );
  });

  it("replaces its own highlights but leaves other pages' alone", () => {
    document.body.innerHTML = "<p>Alpha beta gamma.</p>";
    registry.set("another-app", new Set());
    draw([{ exact: "Alpha" }]);
    draw([{ exact: "gamma" }]);
    expect([...registry.keys()].filter((name) => name.startsWith("mdbase-reader-"))).toHaveLength(
      1,
    );
    expect(registry.has("another-app")).toBe(true);
    expect(document.querySelectorAll("style[data-mdbase-reader-highlights]")).toHaveLength(1);
  });

  it("reveals a drawn highlight without drawing the others again", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = "<p>Alpha beta gamma.</p><p>Delta epsilon.</p>";
    const quotes = [{ exact: "beta" }, { exact: "epsilon", color: "blue" }];
    await drawPageQuotes(1, quotes, location.href);
    const drawn = new Map(registry);
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    expect(await revealPageQuote(1, quotes, 1, location.href)).toBeNull();
    expect(executeScript).toHaveBeenCalledTimes(2);
    for (const [name, highlight] of drawn) {
      expect(registry.get(name)).toBe(highlight);
    }
    expect([...(registry.get("mdbase-reader-focus") ?? [])].map(String)).toEqual(["epsilon"]);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(document.querySelector("style[data-mdbase-reader-highlights]")?.textContent).toMatch(
      /::highlight\(mdbase-reader-focus\) \{ text-decoration: underline 3px #78bcee;/u,
    );
    await vi.advanceTimersByTimeAsync(3000);
    expect(registry.has("mdbase-reader-focus")).toBe(false);
  });

  it("draws everything when the revealed highlight is not on the page", async () => {
    document.body.innerHTML = "<p>Alpha beta gamma.</p>";
    const quotes = [{ exact: "beta" }, { exact: "gamma" }];
    await drawPageQuotes(1, quotes, location.href);
    // The page replaced its text: the drawn ranges no longer point at anything.
    document.body.innerHTML = "<p>Alpha beta gamma.</p>";
    Element.prototype.scrollIntoView = vi.fn();
    const projection = await revealPageQuote(1, quotes, 0, location.href);
    expect(projection?.outcomes).toEqual(["shown", "shown"]);
    expect([...(registry.get("mdbase-reader-focus") ?? [])].map(String)).toEqual(["beta"]);
    expect(
      [...registry.values()].every((highlight) =>
        [...highlight].every((range) => range.startContainer.isConnected),
      ),
    ).toBe(true);
  });

  it("refuses to draw on a tab that has navigated to another page", async () => {
    await expect(drawPageQuotes(1, [], "https://elsewhere.example/")).rejects.toThrow(
      "The tab has navigated to another page.",
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
    document.body.innerHTML = new DOMParser().parseFromString(live, "text/html").body.innerHTML;
    expect(draw(quotes).outcomes).toEqual(["shown", "shown", "shown"]);
  });
});

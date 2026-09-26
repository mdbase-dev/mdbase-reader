import type { Annotation, QuoteSelector } from "@mdbase-reader/core";

export interface PageQuote extends QuoteSelector {
  readonly color?: string;
}
export interface ProjectionReport {
  readonly total: number;
  readonly shown: number;
  readonly missing: number;
  readonly ambiguous: number;
}
/** Whether each requested quote was drawn on the page, in request order. */
export type QuoteOutcome = "shown" | "missing" | "ambiguous";
export interface PageAnnotationResult {
  readonly report: ProjectionReport;
  readonly quotes: readonly (QuoteSelector | null)[];
  readonly outcomes: readonly QuoteOutcome[];
  readonly selection: QuoteSelector | null;
}

export function annotationQuotes(annotations: readonly Annotation[]): readonly PageQuote[] {
  return annotations.flatMap((annotation) =>
    annotation.target?.quote
      ? [{ ...annotation.target.quote, ...(annotation.color ? { color: annotation.color } : {}) }]
      : [],
  );
}

/** Chrome serializes this function alone: all runtime helpers must be nested. */
// eslint-disable-next-line max-lines-per-function
export function pageAnnotations(
  request: {
    readonly action: "render" | "locate" | "selection";
    readonly quotes?: readonly PageQuote[];
    readonly expectedUrl?: string;
    /** With `render`: scroll to this quote (by index) and mark it briefly. */
    readonly focus?: number;
  },
  doc: Document = document,
): PageAnnotationResult {
  if (
    request.expectedUrl &&
    doc.location.href.split("#")[0] !== request.expectedUrl.split("#")[0]
  ) {
    throw new Error("The tab has navigated to another page. Reopen the extension there.");
  }
  interface Entry {
    node: Text;
    start: number;
    end: number;
  }
  const normalize = (value: string): string => value.replace(/\s+/gu, " ");
  const { text, nodes } = indexDocument();
  const { haystack, starts, ends } = normalizeIndex();
  const report = { total: request.quotes?.length ?? 0, shown: 0, missing: 0, ambiguous: 0 };
  const quotes: (QuoteSelector | null)[] = [];
  const outcomes: QuoteOutcome[] = [];
  const decorations: { range: Range; color: string; index: number }[] = [];
  for (const [index, quote] of (request.quotes ?? []).entries()) {
    const match = locate(quote);
    if (match === "missing" || match === "ambiguous") {
      report[match]++;
      quotes.push(null);
      outcomes.push(match);
    } else {
      quotes.push(quoteAt(match.start, match.end));
      outcomes.push("shown");
      report.shown++;
      decorations.push({ range: match.range, color: quote.color ?? "yellow", index });
    }
  }
  if (request.action === "render") {
    render();
  }
  return {
    report,
    quotes,
    outcomes,
    selection: request.action === "selection" ? selection() : null,
  };

  function indexDocument(): { text: string; nodes: Entry[] } {
    const excluded =
      "script,style,noscript,textarea,input,select,[contenteditable],[hidden],[aria-hidden='true'],[data-mdbase-reader-ui]";
    const nodes: Entry[] = [];
    let text = "";
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest(excluded)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const start = text.length;
      text += node.textContent ?? "";
      nodes.push({ node: node as Text, start, end: text.length });
    }
    return { text, nodes };
  }
  function normalizeIndex(): { haystack: string; starts: number[]; ends: number[] } {
    const normalized: string[] = [];
    const starts: number[] = [];
    const ends: number[] = [];
    for (let i = 0; i < text.length; i++) {
      const char = text.charAt(i);
      if (/\s/u.test(char) && normalized.at(-1) === " ") {
        ends[ends.length - 1] = i + 1;
      } else {
        normalized.push(/\s/u.test(char) ? " " : char);
        starts.push(i);
        ends.push(i + 1);
      }
    }
    return { haystack: normalized.join(""), starts, ends };
  }
  function quoteAt(start: number, end: number): QuoteSelector {
    return {
      exact: text.slice(start, end),
      prefix: text.slice(Math.max(0, start - 64), start),
      suffix: text.slice(end, end + 64),
    };
  }
  function rangeAt(start: number, end: number): Range | null {
    const first = nodes.find((entry) => entry.start <= start && entry.end > start);
    const last = nodes.find((entry) => entry.start < end && entry.end >= end);
    if (!first || !last) {
      return null;
    }
    const range = doc.createRange();
    range.setStart(first.node, start - first.start);
    range.setEnd(last.node, end - last.start);
    return range;
  }
  function selection(): QuoteSelector | null {
    const selected = doc.defaultView?.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed) {
      return null;
    }
    const range = selected.getRangeAt(0);
    const offsets = nodes.flatMap(({ node, start }) => {
      if (!range.intersectsNode(node)) {
        return [];
      }
      const from = range.startContainer === node ? range.startOffset : 0;
      const to = range.endContainer === node ? range.endOffset : node.length;
      return to > from ? [{ start: start + from, end: start + to }] : [];
    });
    const first = offsets[0];
    const last = offsets.at(-1);
    return first && last ? quoteAt(first.start, last.end) : null;
  }
  function locate(
    quote: QuoteSelector,
  ): { start: number; end: number; range: Range } | "missing" | "ambiguous" {
    const needle = normalize(quote.exact).trim();
    if (!needle) {
      return "missing";
    }
    const matches: number[] = [];
    for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) {
      matches.push(i);
    }
    const contextual = matches.length > 1 ? bestContext(matches, needle.length, quote) : matches;
    const index = contextual[0];
    if (contextual.length !== 1 || index === undefined) {
      return matches.length > 1 ? "ambiguous" : "missing";
    }
    const start = starts[index];
    const end = ends[index + needle.length - 1];
    if (start === undefined || end === undefined) {
      return "missing";
    }
    const range = rangeAt(start, end);
    return range ? { start, end, range } : "missing";
  }
  /**
   * Context is captured from one copy of the text (the live page) and matched against
   * another (the saved reading copy), so it rarely agrees character for character.
   * Score each repeat by how much surrounding text agrees; accept only a clear winner.
   */
  function bestContext(matches: readonly number[], length: number, quote: QuoteSelector): number[] {
    const prefix = normalize(quote.prefix ?? "");
    const suffix = normalize(quote.suffix ?? "");
    const scored = matches
      .map((index) => {
        let before = 0;
        while (
          before < prefix.length &&
          index - before > 0 &&
          haystack[index - before - 1] === prefix[prefix.length - before - 1]
        ) {
          before++;
        }
        let after = 0;
        const end = index + length;
        while (after < suffix.length && haystack[end + after] === suffix[after]) {
          after++;
        }
        return { index, score: before + after };
      })
      .sort((a, b) => b.score - a.score);
    const [best, runnerUp] = scored;
    // A few shared characters (a space, "the ") are coincidence, not evidence.
    return best && best.score >= 4 && best.score > (runnerUp?.score ?? 0) ? [best.index] : [];
  }
  function render(): void {
    // No text-node splitting: overlapping ranges and links remain intact.
    const css = doc.defaultView?.CSS as { highlights?: HighlightRegistry } | undefined;
    const HighlightClass = doc.defaultView?.Highlight;
    const highlights = css?.highlights;
    if (!highlights || !HighlightClass) {
      throw new Error("This browser cannot display highlights. Open the saved copy in Reader.");
    }
    for (const name of highlights.keys()) {
      if (name.startsWith("mdbase-reader-")) {
        highlights.delete(name);
      }
    }
    doc.querySelector("style[data-mdbase-reader-highlights]")?.remove();
    const palette: Record<string, string> = {
      yellow: "#f7d24e88",
      green: "#83cf9988",
      blue: "#78bcee88",
      pink: "#f49fc688",
      purple: "#bb9bec88",
    };
    const style = doc.createElement("style");
    style.dataset["mdbaseReaderHighlights"] = "true";
    style.textContent = decorations
      .map(({ range, color }, index) => {
        const name = `mdbase-reader-${String(index)}`;
        highlights.set(name, new HighlightClass(range));
        return `::highlight(${name}) { background-color: ${palette[color] ?? "#f7d24e88"}; color: inherit; }`;
      })
      .join("\n");
    doc.head.append(style);
    const focused = decorations.find(({ index }) => index === request.focus);
    if (focused) {
      highlights.set("mdbase-reader-focus", new HighlightClass(focused.range));
      style.textContent += `\n::highlight(mdbase-reader-focus) { text-decoration: underline 3px ${(palette[focused.color] ?? "#f7d24e").slice(0, 7)}; text-underline-offset: 3px; }`;
      const element = focused.range.startContainer.parentElement;
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
      // Only this marker goes; a later render may already have replaced it.
      const marker = highlights.get("mdbase-reader-focus");
      setTimeout(() => {
        if (highlights.get("mdbase-reader-focus") === marker) {
          highlights.delete("mdbase-reader-focus");
        }
      }, 2500);
    }
  }
}

import { textQuoteMatcher, type Annotation, type QuoteSelector } from "@mdbase-reader/core";

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
export interface PageProjection {
  readonly report: ProjectionReport;
  /** One per quote passed in, in the same order. */
  readonly outcomes: readonly QuoteOutcome[];
}
/** A located quote: offsets into the page text that {@link pageText} indexed. */
export interface PageHighlight {
  readonly start: number;
  readonly end: number;
  readonly color: string;
  /** The quote's position in the request, for `focus`. */
  readonly index: number;
}
export type PageTextRequest =
  | { readonly action: "text"; readonly expectedUrl?: string }
  | { readonly action: "selection" }
  | {
      readonly action: "render";
      readonly highlights: readonly PageHighlight[];
      /** The indexed text's version; a page that changed since then is not drawn on. */
      readonly version: string;
      readonly expectedUrl?: string;
      /** Scroll to the highlight with this index and mark it briefly. */
      readonly focus?: number;
    };
export interface PageTextResult {
  readonly text?: string;
  readonly version?: string;
  readonly selection?: QuoteSelector | null;
  readonly rendered?: boolean;
}

export function annotationQuotes(annotations: readonly Annotation[]): readonly PageQuote[] {
  return annotations.flatMap((annotation) =>
    annotation.target?.quote
      ? [{ ...annotation.target.quote, ...(annotation.color ? { color: annotation.color } : {}) }]
      : [],
  );
}

/** Where each quote falls in the page's text, anchored exactly as Reader anchors it. */
export function locateQuotes(
  text: string,
  quotes: readonly PageQuote[],
): PageProjection & { readonly highlights: readonly PageHighlight[] } {
  const match = textQuoteMatcher(text);
  const report = { total: quotes.length, shown: 0, missing: 0, ambiguous: 0 };
  const outcomes: QuoteOutcome[] = [];
  const highlights: PageHighlight[] = [];
  for (const [index, quote] of quotes.entries()) {
    const found = match(quote);
    const outcome = !found ? "missing" : found.ambiguous ? "ambiguous" : "shown";
    report[outcome]++;
    outcomes.push(outcome);
    if (found && outcome === "shown") {
      highlights.push({
        start: found.start,
        end: found.end,
        color: quote.color ?? "yellow",
        index,
      });
    }
  }
  return { report, outcomes, highlights };
}

/**
 * Draws the quotes on the tab, optionally scrolling to the one at `focus`. The page is
 * indexed, matched here, then drawn; if it changes in between, the round trip repeats.
 */
export async function drawPageQuotes(
  tabId: number,
  quotes: readonly PageQuote[],
  expectedUrl: string,
  focus?: number,
): Promise<PageProjection> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const indexed = await injectPageText(tabId, { action: "text", expectedUrl });
    const { report, outcomes, highlights } = locateQuotes(indexed.text ?? "", quotes);
    const drawn = await injectPageText(tabId, {
      action: "render",
      highlights,
      version: indexed.version ?? "",
      expectedUrl,
      ...(focus === undefined ? {} : { focus }),
    });
    if (drawn.rendered) {
      return { report, outcomes };
    }
  }
  throw new Error("The page kept changing while Reader drew its highlights. Try again.");
}

export async function injectPageText(
  tabId: number,
  request: PageTextRequest,
): Promise<PageTextResult> {
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId },
    func: pageText,
    args: [request],
  });
  if (!execution?.result) {
    throw new Error("Could not read this page. Reopen the extension on it.");
  }
  return execution.result;
}

/**
 * Injected. Indexes the page's visible text, reads the selection, or draws highlights at
 * offsets into that same text. Matching happens in the extension, not here.
 * Chrome serializes this function alone: all runtime helpers must be nested.
 */
// eslint-disable-next-line max-lines-per-function
export function pageText(request: PageTextRequest, doc: Document = document): PageTextResult {
  if (
    "expectedUrl" in request &&
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
  const { text, nodes } = indexDocument();
  const version = versionOf(text);
  switch (request.action) {
    case "text":
      return { text, version };
    case "selection":
      return { selection: selection() };
    case "render":
      if (request.version !== version) {
        return { rendered: false };
      }
      render(request.highlights, request.focus);
      return { rendered: true };
  }

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
  function versionOf(value: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
      hash = Math.imul(hash ^ value.charCodeAt(i), 0x01000193);
    }
    return `${String(value.length)}:${(hash >>> 0).toString(16)}`;
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
    if (!first || !last) {
      return null;
    }
    // As `textQuoteAt` records it in Reader.
    const prefix = text.slice(Math.max(0, first.start - 64), first.start);
    const suffix = text.slice(last.end, last.end + 64);
    return {
      exact: text.slice(first.start, last.end),
      ...(prefix ? { prefix } : {}),
      ...(suffix ? { suffix } : {}),
    };
  }
  function render(highlights: readonly PageHighlight[], focus: number | undefined): void {
    // No text-node splitting: overlapping ranges and links remain intact.
    const css = doc.defaultView?.CSS as { highlights?: HighlightRegistry } | undefined;
    const HighlightClass = doc.defaultView?.Highlight;
    const registry = css?.highlights;
    if (!registry || !HighlightClass) {
      throw new Error("This browser cannot display highlights. Open the saved copy in Reader.");
    }
    for (const name of registry.keys()) {
      if (name.startsWith("mdbase-reader-")) {
        registry.delete(name);
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
    const decorations = highlights.flatMap((highlight) => {
      const range = rangeAt(highlight.start, highlight.end);
      return range ? [{ ...highlight, range }] : [];
    });
    const style = doc.createElement("style");
    style.dataset["mdbaseReaderHighlights"] = "true";
    style.textContent = decorations
      .map(({ range, color }, index) => {
        const name = `mdbase-reader-${String(index)}`;
        registry.set(name, new HighlightClass(range));
        return `::highlight(${name}) { background-color: ${palette[color] ?? "#f7d24e88"}; color: inherit; }`;
      })
      .join("\n");
    doc.head.append(style);
    const focused = decorations.find(({ index }) => index === focus);
    if (focused) {
      registry.set("mdbase-reader-focus", new HighlightClass(focused.range));
      style.textContent += `\n::highlight(mdbase-reader-focus) { text-decoration: underline 3px ${(palette[focused.color] ?? "#f7d24e").slice(0, 7)}; text-underline-offset: 3px; }`;
      const element = focused.range.startContainer.parentElement;
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
      // Only this marker goes; a later render may already have replaced it.
      const marker = registry.get("mdbase-reader-focus");
      setTimeout(() => {
        if (registry.get("mdbase-reader-focus") === marker) {
          registry.delete("mdbase-reader-focus");
        }
      }, 2500);
    }
  }
}

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
export interface PageProjection {
  readonly report: ProjectionReport;
  /** One per quote passed in, in the same order. */
  readonly outcomes: readonly QuoteOutcome[];
}
export type PageTextRequest =
  | { readonly action: "text"; readonly expectedUrl?: string }
  | { readonly action: "selection" }
  | {
      readonly action: "draw";
      readonly quotes: readonly PageQuote[];
      readonly expectedUrl?: string;
      /** Scroll to the quote with this index and mark it briefly. */
      readonly focus?: number;
    }
  | {
      /** Scrolls to an already drawn quote; draws them all only when it is not on the page. */
      readonly action: "reveal";
      readonly quotes: readonly PageQuote[];
      readonly focus: number;
      readonly expectedUrl?: string;
    };
export interface PageTextResult {
  readonly text?: string;
  readonly selection?: QuoteSelector | null;
  /** Present when the quotes were (re)drawn. */
  readonly projection?: PageProjection;
  /** The tab is no longer on the page the request was made for. */
  readonly navigated?: boolean;
}

const navigatedMessage =
  "The tab has navigated to another page. Reopen Reader’s extension on that page.";

export function annotationQuotes(annotations: readonly Annotation[]): readonly PageQuote[] {
  return annotations.flatMap((annotation) =>
    annotation.target?.quote
      ? [{ ...annotation.target.quote, ...(annotation.color ? { color: annotation.color } : {}) }]
      : [],
  );
}

/**
 * Draws the quotes on the tab, optionally scrolling to the one at `focus`. The page indexes
 * its text, anchors the quotes and draws them in one injection, so nothing changes between.
 */
export async function drawPageQuotes(
  tabId: number,
  quotes: readonly PageQuote[],
  expectedUrl: string,
  focus?: number,
): Promise<PageProjection> {
  const { projection } = await injectPageText(tabId, {
    action: "draw",
    quotes,
    expectedUrl,
    ...(focus === undefined ? {} : { focus }),
  });
  if (!projection) {
    throw new Error("Could not read this page. Reopen the extension on it.");
  }
  return projection;
}

/**
 * Scrolls to the quote at `focus` and marks it briefly. When it is already drawn nothing
 * else is touched and this returns null; otherwise every quote is drawn, as by
 * {@link drawPageQuotes}, and the new projection is returned.
 */
export async function revealPageQuote(
  tabId: number,
  quotes: readonly PageQuote[],
  focus: number,
  expectedUrl: string,
): Promise<PageProjection | null> {
  const { projection } = await injectPageText(tabId, {
    action: "reveal",
    quotes,
    focus,
    expectedUrl,
  });
  return projection ?? null;
}

export async function injectPageText(
  tabId: number,
  request: PageTextRequest,
): Promise<PageTextResult> {
  let execution: chrome.scripting.InjectionResult<PageTextResult> | undefined;
  try {
    [execution] = await chrome.scripting.executeScript({
      target: { tabId },
      func: pageText,
      args: [request],
    });
  } catch (reason) {
    // Navigating away usually also ends `activeTab` access; say why, not that access failed.
    const url = "expectedUrl" in request ? request.expectedUrl : undefined;
    const tab = url ? await chrome.tabs.get(tabId).catch(() => null) : null;
    if (url && tab?.url && tab.url.split("#")[0] !== url.split("#")[0]) {
      throw new Error(navigatedMessage, { cause: reason });
    }
    throw reason;
  }
  if (!execution?.result) {
    throw new Error("Could not read this page. Reopen the extension on it.");
  }
  if (execution.result.navigated) {
    throw new Error(navigatedMessage);
  }
  return execution.result;
}

/**
 * Injected. Indexes the page's visible text, reads the selection, or anchors quotes in that
 * text and draws them. Anchoring mirrors `textQuoteMatcher` in core, which Reader uses; it
 * is repeated here because Chrome serializes this function alone, so all runtime helpers
 * must be nested. page-annotations.test.ts checks that the two agree.
 */
// eslint-disable-next-line max-lines-per-function
export function pageText(request: PageTextRequest, doc: Document = document): PageTextResult {
  if (
    "expectedUrl" in request &&
    request.expectedUrl &&
    doc.location.href.split("#")[0] !== request.expectedUrl.split("#")[0]
  ) {
    return { navigated: true };
  }
  interface Entry {
    node: Text;
    start: number;
    end: number;
  }
  interface Candidate {
    readonly start: number;
    readonly end: number;
    readonly errors: number;
  }
  const excluded =
    "script,style,noscript,textarea,input,select,[contenteditable],[hidden],[aria-hidden='true'],[data-mdbase-reader-ui]";
  // As `textQuoteContextLength` in core.
  const contextLength = 64;
  switch (request.action) {
    case "text":
      return { text: indexDocument().text };
    case "selection":
      return { selection: selection() };
    case "draw":
      return { projection: draw(request.quotes, request.focus) };
    case "reveal":
      return reveal(request.quotes, request.focus);
  }

  function indexDocument(): { text: string; nodes: Entry[] } {
    const nodes: Entry[] = [];
    let text = "";
    if (doc.body.closest(excluded)) {
      return { text, nodes };
    }
    // Rejecting an excluded element skips its whole subtree, so no text node needs a lookup.
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return (node as Element).matches(excluded)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_SKIP;
      },
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const start = text.length;
      text += (node as Text).data;
      nodes.push({ node: node as Text, start, end: text.length });
    }
    return { text, nodes };
  }

  /** The first entry whose end passes `offset` (or reaches it, with `inclusive`). */
  function entryAt(nodes: readonly Entry[], offset: number, inclusive: boolean): Entry | null {
    let low = 0;
    let high = nodes.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      const end = nodes[middle]?.end ?? 0;
      if (inclusive ? end >= offset : end > offset) {
        high = middle;
      } else {
        low = middle + 1;
      }
    }
    return nodes[low] ?? null;
  }
  function rangeAt(nodes: readonly Entry[], start: number, end: number): Range | null {
    const first = entryAt(nodes, start, false);
    const last = entryAt(nodes, end, true);
    if (!first || !last || first.start > start || last.start >= end) {
      return null;
    }
    const range = doc.createRange();
    range.setStart(first.node, start - first.start);
    range.setEnd(last.node, end - last.start);
    return range;
  }

  /**
   * Reads the selection from its own text and the context around it, without indexing the
   * page. Text the index leaves out is left out here too.
   */
  function selection(): QuoteSelector | null {
    const selected = doc.defaultView?.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed) {
      return null;
    }
    const range = selected.getRangeAt(0);
    const { indexed, step } = textWalker();
    const deepestLast = (node: Node): Node => (node.lastChild ? deepestLast(node.lastChild) : node);
    /** The indexed text at a range boundary, moving inward when the boundary is between nodes. */
    const boundary = (
      container: Node,
      offset: number,
      forward: boolean,
    ): { node: Text; offset: number } | null => {
      let node: Text | null;
      if (container.nodeType === Node.TEXT_NODE) {
        if (indexed(container)) {
          return { node: container, offset };
        }
        node = step(container, forward);
      } else {
        const child = container.childNodes[forward ? offset : offset - 1];
        const edge = child ? (forward ? child : deepestLast(child)) : null;
        if (edge && indexed(edge)) {
          node = edge;
        } else if (edge) {
          node = step(edge, forward);
        } else {
          node = step(forward ? deepestLast(container) : container, forward);
        }
      }
      return node ? { node, offset: forward ? 0 : node.length } : null;
    };
    const first = boundary(range.startContainer, range.startOffset, true);
    const last = boundary(range.endContainer, range.endOffset, false);
    const inOrder = (from: Text, to: Text): boolean =>
      from === to || Boolean(from.compareDocumentPosition(to) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!first || !last || !inOrder(first.node, last.node)) {
      return null;
    }
    let exact = first.node.data.slice(
      first.offset,
      first.node === last.node ? last.offset : undefined,
    );
    for (let node = first.node; node !== last.node;) {
      const next = step(node, true);
      if (!next) {
        break;
      }
      exact += next === last.node ? next.data.slice(0, last.offset) : next.data;
      node = next;
    }
    // Anchoring ignores whitespace, so the page's layout whitespace is collapsed for display.
    exact = exact.replace(/\s+/gu, " ").trim();
    if (!exact) {
      return null;
    }
    // As `textQuoteAt` records it in Reader.
    const context = (from: Text, edge: string, forward: boolean): string => {
      let value = edge;
      for (let node = step(from, forward); node && value.length < contextLength;) {
        value = forward ? value + node.data : node.data + value;
        node = step(node, forward);
      }
      return forward ? value.slice(0, contextLength) : value.slice(-contextLength);
    };
    const prefix = context(first.node, first.node.data.slice(0, first.offset), false);
    const suffix = context(last.node, last.node.data.slice(last.offset), true);
    return { exact, ...(prefix ? { prefix } : {}), ...(suffix ? { suffix } : {}) };
  }

  /**
   * Steps through the text the index would include, from any node. Exclusion is decided per
   * element once, so starting inside an excluded subtree still skips its text.
   */
  function textWalker(): {
    indexed: (node: Node) => node is Text;
    step: (from: Node, forward: boolean) => Text | null;
  } {
    const verdicts = new Map<Element, boolean>();
    const isExcluded = (element: Element | null): boolean => {
      if (!element) {
        return false;
      }
      let verdict = verdicts.get(element);
      if (verdict === undefined) {
        verdict = element.matches(excluded) || isExcluded(element.parentElement);
        verdicts.set(element, verdict);
      }
      return verdict;
    };
    const indexed = (node: Node): node is Text =>
      node.nodeType === Node.TEXT_NODE && !isExcluded(node.parentElement);
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          return indexed(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
        return isExcluded(node as Element) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
      },
    });
    const step = (from: Node, forward: boolean): Text | null => {
      walker.currentNode = from;
      return (forward ? walker.nextNode() : walker.previousNode()) as Text | null;
    };
    return { indexed, step };
  }

  function highlights(): { registry: HighlightRegistry; HighlightClass: typeof Highlight } {
    const css = doc.defaultView?.CSS as { highlights?: HighlightRegistry } | undefined;
    const HighlightClass = doc.defaultView?.Highlight;
    const registry = css?.highlights;
    if (!registry || !HighlightClass) {
      throw new Error("This browser cannot display highlights. Open the saved copy in Reader.");
    }
    return { registry, HighlightClass };
  }
  function colorOf(quote: PageQuote): string {
    const palette: Record<string, string> = {
      yellow: "#f7d24e88",
      green: "#83cf9988",
      blue: "#78bcee88",
      pink: "#f49fc688",
      purple: "#bb9bec88",
    };
    return palette[quote.color ?? "yellow"] ?? "#f7d24e88";
  }
  /** Named after the quote itself, so a later reveal can find it without redrawing. */
  function highlightName(quote: PageQuote): string {
    const key = [quote.color ?? "", quote.prefix ?? "", quote.exact, quote.suffix ?? ""].join("\0");
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
      hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
    }
    return `mdbase-reader-${(hash >>> 0).toString(16)}`;
  }
  function focusOn(range: AbstractRange, color: string): void {
    const { registry, HighlightClass } = highlights();
    registry.set("mdbase-reader-focus", new HighlightClass(range));
    const style = doc.querySelector("style[data-mdbase-reader-highlights]");
    const rule = `::highlight(mdbase-reader-focus) { text-decoration: underline 3px ${color.slice(0, 7)}; text-underline-offset: 3px; }`;
    if (style) {
      // One focus rule at a time, in the stylesheet a capture leaves out.
      style.textContent = `${style.textContent.replace(/\n::highlight\(mdbase-reader-focus\).*$/u, "")}\n${rule}`;
    }
    range.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
    // Only this marker goes; a later draw or reveal may already have replaced it.
    const marker = registry.get("mdbase-reader-focus");
    setTimeout(() => {
      if (registry.get("mdbase-reader-focus") === marker) {
        registry.delete("mdbase-reader-focus");
      }
    }, 2500);
  }

  function reveal(quotes: readonly PageQuote[], focus: number): PageTextResult {
    const quote = quotes[focus];
    const drawn = quote ? highlights().registry.get(highlightName(quote)) : undefined;
    const [range] = drawn ? [...drawn] : [];
    // A page that replaced the highlighted text leaves the old range detached or empty.
    if (quote && range && !range.collapsed && range.startContainer.isConnected) {
      focusOn(range, colorOf(quote));
      return {};
    }
    return { projection: draw(quotes, focus) };
  }

  function draw(quotes: readonly PageQuote[], focus: number | undefined): PageProjection {
    // No text-node splitting: overlapping ranges and links remain intact.
    const { registry, HighlightClass } = highlights();
    const { text, nodes } = indexDocument();
    const match = quoteMatcher(text);
    const report = { total: quotes.length, shown: 0, missing: 0, ambiguous: 0 };
    const outcomes: QuoteOutcome[] = [];
    const decorations = new Map<string, { range: Range; quote: PageQuote }>();
    let focused: { range: Range; quote: PageQuote } | undefined;
    for (const [index, quote] of quotes.entries()) {
      const found = match(quote);
      const outcome = !found ? "missing" : found.ambiguous ? "ambiguous" : "shown";
      report[outcome]++;
      outcomes.push(outcome);
      const range = found && outcome === "shown" ? rangeAt(nodes, found.start, found.end) : null;
      if (range) {
        // Identical quotes anchor identically, so one highlight serves them all.
        decorations.set(highlightName(quote), { range, quote });
        focused = index === focus ? { range, quote } : focused;
      }
    }
    for (const name of registry.keys()) {
      if (name.startsWith("mdbase-reader-")) {
        registry.delete(name);
      }
    }
    doc.querySelector("style[data-mdbase-reader-highlights]")?.remove();
    const style = doc.createElement("style");
    style.dataset["mdbaseReaderHighlights"] = "true";
    style.textContent = [...decorations]
      .map(([name, { range, quote }]) => {
        registry.set(name, new HighlightClass(range));
        return `::highlight(${name}) { background-color: ${colorOf(quote)}; color: inherit; }`;
      })
      .join("\n");
    doc.head.append(style);
    if (focused) {
      focusOn(focused.range, colorOf(focused.quote));
    }
    return { report, outcomes };
  }

  /** `textQuoteMatcher` from core; see that module for the reasoning behind each step. */
  // eslint-disable-next-line max-lines-per-function
  function quoteMatcher(
    text: string,
  ): (quote: QuoteSelector) => { start: number; end: number; ambiguous: boolean } | null {
    const minimumContext = 4;
    const minimumApproximateLength = 12;
    const minimumAnchorLength = 6;
    const maximumAnchorOccurrences = 50;
    const maximumComparisonCells = 4_000_000;
    const ignorable = /[\s\u00ad\u200b-\u200d\u2060\ufeff]/u;
    const haystack = normalize(text);
    return (quote) => {
      const needle = normalize(quote.exact).text;
      if (!needle) {
        return null;
      }
      const exact = occurrences(haystack.text, needle, Number.POSITIVE_INFINITY).map((start) => ({
        start,
        end: start + needle.length,
        errors: 0,
      }));
      const candidates = exact.length ? exact : approximate(haystack.text, needle);
      const best = choose(haystack.text, candidates, quote);
      if (!best) {
        return null;
      }
      const start = haystack.offsets[best.start];
      const last = haystack.offsets[best.end - 1];
      if (start === undefined || last === undefined) {
        return null;
      }
      return { start, end: last + 1, ambiguous: best.ambiguous };
    };

    function normalize(value: string): { text: string; offsets: number[] } {
      let normalized = "";
      const offsets: number[] = [];
      for (let index = 0; index < value.length; index++) {
        const character = value.charAt(index);
        if (!ignorable.test(character)) {
          normalized += character;
          offsets.push(index);
        }
      }
      return { text: normalized, offsets };
    }
    function occurrences(value: string, needle: string, limit: number): number[] {
      const found: number[] = [];
      for (
        let index = value.indexOf(needle);
        index !== -1 && found.length < limit;
        index = value.indexOf(needle, index + 1)
      ) {
        found.push(index);
      }
      return found;
    }
    function longestPresent(
      value: string,
      needle: string,
      part: (length: number) => string,
    ): string | null {
      let found = 0;
      let low = minimumAnchorLength;
      let high = needle.length - 1;
      while (low <= high) {
        const length = Math.floor((low + high) / 2);
        if (value.includes(part(length))) {
          found = length;
          low = length + 1;
        } else {
          high = length - 1;
        }
      }
      return found ? part(found) : null;
    }
    function approximate(value: string, needle: string): Candidate[] {
      if (needle.length < minimumApproximateLength) {
        return [];
      }
      const head = longestPresent(value, needle, (length) => needle.slice(0, length));
      const tail = longestPresent(value, needle, (length) => needle.slice(needle.length - length));
      const heads = head ? occurrences(value, head, maximumAnchorOccurrences) : [];
      const tails = tail
        ? occurrences(value, tail, maximumAnchorOccurrences).map((index) => index + tail.length)
        : [];
      const bothAnchored = Math.floor(needle.length / 2);
      const oneAnchored = Math.floor(needle.length / 8);
      const spans = new Map<string, { start: number; end: number; allowed: number }>();
      const add = (start: number, end: number, allowed: number): void => {
        const key = `${String(start)}:${String(end)}`;
        if (start >= 0 && end <= value.length && end > start && !spans.has(key)) {
          spans.set(key, { start, end, allowed });
        }
      };
      for (const start of heads) {
        const ends = tails.filter((end) => Math.abs(end - start - needle.length) <= bothAnchored);
        for (const end of ends) {
          add(start, end, bothAnchored);
        }
        if (!ends.length) {
          add(start, start + needle.length, oneAnchored);
        }
      }
      for (const end of tails) {
        if (!heads.some((start) => Math.abs(end - start - needle.length) <= bothAnchored)) {
          add(end - needle.length, end, oneAnchored);
        }
      }
      return [...spans.values()].flatMap(({ start, end, allowed }) => {
        const errors = editDistance(needle, value.slice(start, end), allowed);
        return errors <= allowed ? [{ start, end, errors }] : [];
      });
    }
    function choose(
      value: string,
      candidates: readonly Candidate[],
      quote: QuoteSelector,
    ): (Candidate & { readonly ambiguous: boolean }) | null {
      const prefix = normalize(quote.prefix ?? "").text;
      const suffix = normalize(quote.suffix ?? "").text;
      const scored = candidates
        .map((candidate) => ({
          ...candidate,
          context:
            commonSuffix(
              value.slice(Math.max(0, candidate.start - prefix.length), candidate.start),
              prefix,
            ) + commonPrefix(value.slice(candidate.end, candidate.end + suffix.length), suffix),
        }))
        .sort((a, b) => a.errors - b.errors || b.context - a.context);
      const [best, runnerUp] = scored;
      if (!best) {
        return null;
      }
      const ambiguous =
        runnerUp?.errors === best.errors &&
        (best.context < minimumContext || runnerUp.context === best.context);
      return { ...best, ambiguous };
    }
    function editDistance(left: string, right: string, limit: number): number {
      if (left.length * right.length > maximumComparisonCells) {
        return Math.abs(left.length - right.length);
      }
      let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
      for (let row = 1; row <= left.length; row++) {
        const current = [row];
        let smallest = row;
        for (let column = 1; column <= right.length; column++) {
          const substitution =
            (previous[column - 1] ?? 0) + (left[row - 1] === right[column - 1] ? 0 : 1);
          const cell = Math.min(
            (previous[column] ?? 0) + 1,
            (current[column - 1] ?? 0) + 1,
            substitution,
          );
          current.push(cell);
          smallest = Math.min(smallest, cell);
        }
        if (smallest > limit) {
          return smallest;
        }
        previous = current;
      }
      return previous[right.length] ?? 0;
    }
    function commonPrefix(left: string, right: string): number {
      let length = 0;
      while (length < left.length && length < right.length && left[length] === right[length]) {
        length++;
      }
      return length;
    }
    function commonSuffix(left: string, right: string): number {
      let length = 0;
      while (
        length < left.length &&
        length < right.length &&
        left[left.length - length - 1] === right[right.length - length - 1]
      ) {
        length++;
      }
      return length;
    }
  }
}

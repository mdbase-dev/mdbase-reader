import type { AnnotationTarget } from "@mdbase-reader/core";
import type { ReaderLocator, TextSelectionDraft } from "@mdbase-reader/reading-surface";

const contextLength = 64;

export function htmlSelectionDraft(input: {
  readonly document: Document;
  readonly range: Range;
  readonly href: string;
  readonly progression: number;
}): TextSelectionDraft | null {
  const exact = input.range.toString().trim();
  if (!exact || !input.document.body.contains(input.range.commonAncestorContainer)) {
    return null;
  }
  const bodyText = input.document.body.textContent;
  const selectedText = input.range.toString();
  const leading = selectedText.length - selectedText.trimStart().length;
  const start = rangeStartOffset(input.document, input.range) + leading;
  const end = start + exact.length;
  const prefix = bodyText.slice(Math.max(0, start - contextLength), start);
  const suffix = bodyText.slice(end, end + contextLength);
  const container = commonElement(input.range, input.document.body);
  return {
    target: {
      quote: {
        exact,
        ...(prefix ? { prefix } : {}),
        ...(suffix ? { suffix } : {}),
      },
      html: { css: cssSelector(container, input.document.body) },
    },
    locator: htmlLocator(input.href, input.progression),
  };
}

export function locateHtmlTarget(document: Document, target: AnnotationTarget): Range | null {
  const quote = target.quote;
  if (!quote) {
    return null;
  }
  const root = selectorRoot(document, target.html?.css);
  const index = textIndex(root);
  const offsets = quoteOffsets(index.text, quote.exact, quote.prefix, quote.suffix);
  if (!offsets) {
    return null;
  }
  return rangeAt(document, index.nodes, offsets.start, offsets.end);
}

export function htmlLocator(href: string, progression: number): ReaderLocator {
  return {
    kind: "html",
    href,
    progression: Math.max(0, Math.min(1, progression)),
  };
}

function rangeStartOffset(document: Document, range: Range): number {
  const prefix = document.createRange();
  prefix.selectNodeContents(document.body);
  prefix.setEnd(range.startContainer, range.startOffset);
  return prefix.toString().length;
}

function commonElement(range: Range, fallback: HTMLElement): Element {
  const ancestor = range.commonAncestorContainer;
  return ancestor.nodeType === Node.ELEMENT_NODE
    ? (ancestor as Element)
    : (ancestor.parentElement ?? fallback);
}

function cssSelector(element: Element, body: HTMLElement): string {
  if (element === body) {
    return "body";
  }
  if (element.id) {
    return `#${escapeIdentifier(element.id)}`;
  }
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && current !== body) {
    const parent: Element | null = current.parentElement;
    const tag = current.localName;
    const siblings = parent ? [...parent.children].filter((child) => child.localName === tag) : [];
    const index = Math.max(0, siblings.indexOf(current)) + 1;
    segments.unshift(`${tag}:nth-of-type(${String(index)})`);
    if (parent?.id) {
      segments.unshift(`#${escapeIdentifier(parent.id)}`);
      break;
    }
    current = parent;
  }
  return segments[0]?.startsWith("#") ? segments.join(" > ") : `body > ${segments.join(" > ")}`;
}

function escapeIdentifier(value: string): string {
  return value.replace(
    /[^a-zA-Z0-9_-]/gu,
    (character) => `\\${String(character.codePointAt(0)?.toString(16))} `,
  );
}

function selectorRoot(document: Document, css: string | undefined): Element {
  if (css) {
    try {
      const selected = document.querySelector(css);
      if (selected) {
        return selected;
      }
    } catch {
      // The quotation remains the portable fallback for a stale native selector.
    }
  }
  return document.body;
}

interface IndexedText {
  readonly text: string;
  readonly nodes: readonly { readonly node: Text; readonly start: number; readonly end: number }[];
}

function textIndex(root: Element): IndexedText {
  const nodes: { node: Text; start: number; end: number }[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = "";
  let current = walker.nextNode();
  while (current) {
    const node = current as Text;
    const start = text.length;
    text += node.data;
    nodes.push({ node, start, end: text.length });
    current = walker.nextNode();
  }
  return { text, nodes };
}

function quoteOffsets(
  text: string,
  exact: string,
  prefix: string | undefined,
  suffix: string | undefined,
): { readonly start: number; readonly end: number } | null {
  let best: { start: number; score: number } | null = null;
  let start = text.indexOf(exact);
  while (start >= 0) {
    const before = text.slice(Math.max(0, start - (prefix?.length ?? 0)), start);
    const end = start + exact.length;
    const after = text.slice(end, end + (suffix?.length ?? 0));
    const score = commonSuffix(before, prefix ?? "") + commonPrefix(after, suffix ?? "");
    if (!best || score > best.score) {
      best = { start, score };
    }
    start = text.indexOf(exact, start + 1);
  }
  return best ? { start: best.start, end: best.start + exact.length } : null;
}

function rangeAt(
  document: Document,
  nodes: IndexedText["nodes"],
  start: number,
  end: number,
): Range | null {
  const startNode = nodes.find((entry) => start >= entry.start && start <= entry.end);
  const endNode = [...nodes].reverse().find((entry) => end >= entry.start && end <= entry.end);
  if (!startNode || !endNode) {
    return null;
  }
  const range = document.createRange();
  range.setStart(startNode.node, start - startNode.start);
  range.setEnd(endNode.node, end - endNode.start);
  return range;
}

function commonPrefix(left: string, right: string): number {
  let length = 0;
  while (length < left.length && length < right.length && left[length] === right[length]) {
    length += 1;
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
    length += 1;
  }
  return length;
}

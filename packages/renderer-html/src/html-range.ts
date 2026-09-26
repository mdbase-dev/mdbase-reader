import { textQuoteAt } from "@mdbase-reader/core";
import { locateTextQuote } from "@mdbase-reader/reading-surface";

import type { AnnotationTarget } from "@mdbase-reader/core";
import type { ReaderLocator, TextSelectionDraft } from "@mdbase-reader/reading-surface";

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
  const body = input.document.body;
  const container = commonElement(input.range, body);
  const selectedText = input.range.toString();
  const leading = selectedText.length - selectedText.trimStart().length;
  const start = rangeStartOffset(body, input.range) + leading;
  // Context spans the whole document, as on the live page: a passage opening its block
  // still carries the text before it, which tells repeats apart there.
  const { prefix, suffix } = textQuoteAt(body.textContent, start, start + exact.length);
  return {
    target: {
      quote: {
        exact,
        ...(prefix ? { prefix } : {}),
        ...(suffix ? { suffix } : {}),
      },
      html: { css: cssSelector(container, body) },
    },
    locator: htmlLocator(input.href, input.progression),
  };
}

export function locateHtmlTarget(document: Document, target: AnnotationTarget): Range | null {
  const quote = target.quote;
  if (!quote) {
    return null;
  }
  return locateTextQuote(selectorRoot(document, target.html?.css), quote);
}

export function htmlLocator(href: string, progression: number): ReaderLocator {
  return {
    kind: "html",
    href,
    progression: Math.max(0, Math.min(1, progression)),
  };
}

function rangeStartOffset(root: Element, range: Range): number {
  const prefix = root.ownerDocument.createRange();
  prefix.selectNodeContents(root);
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

import { textQuoteAt } from "@mdbase-reader/core";
import { createTextQuoteLocator, locateTextQuote } from "@mdbase-reader/reading-surface";

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

/** Runtime-scoped indexes and ranges, invalidated by content/selector changes, not reflow. */
export class HtmlTargetLocator {
  #indexes = new WeakMap<Element, ReturnType<typeof createTextQuoteLocator>>();
  readonly #ranges = new Map<string, { root: Element; range: Range | null }>();
  readonly #observer: MutationObserver;

  constructor(private readonly document: Document) {
    this.#observer = new MutationObserver(() => this.#invalidate());
    this.#observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["id", "class"],
    });
  }

  locate(target: AnnotationTarget): Range | null {
    // MutationObserver callbacks run later; synchronous edits must invalidate too.
    if (this.#observer.takeRecords().length) {
      this.#invalidate();
    }
    if (!target.quote) {
      return null;
    }
    const root = selectorRoot(this.document, target.html?.css);
    const key = JSON.stringify([target.html?.css, target.quote]);
    const cached = this.#ranges.get(key);
    if (cached?.root === root) {
      return cached.range;
    }
    let locate = this.#indexes.get(root);
    if (!locate) {
      locate = createTextQuoteLocator(root);
      this.#indexes.set(root, locate);
    }
    const range = locate(target.quote);
    this.#ranges.set(key, { root, range });
    if (this.#ranges.size > 2_000) {
      const oldest = this.#ranges.keys().next().value;
      if (oldest !== undefined) {
        this.#ranges.delete(oldest);
      }
    }
    return range;
  }

  destroy(): void {
    this.#observer.disconnect();
    this.#invalidate();
  }

  #invalidate(): void {
    this.#indexes = new WeakMap();
    this.#ranges.clear();
  }
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

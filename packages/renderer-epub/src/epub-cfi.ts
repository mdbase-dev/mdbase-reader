const CONTEXT_LENGTH = 32;

export interface EpubSelectionEvidence {
  readonly cfi: string;
  readonly prefix?: string;
  readonly suffix?: string;
}

/** Creates a canonical EPUB range CFI from a live content-document selection. */
export function epubSelectionEvidence(
  range: Range,
  readingOrderIndex: number,
): EpubSelectionEvidence | null {
  if (
    readingOrderIndex < 0 ||
    !Number.isInteger(readingOrderIndex) ||
    range.collapsed ||
    range.startContainer.ownerDocument !== range.endContainer.ownerDocument
  ) {
    return null;
  }
  const document = range.startContainer.ownerDocument;
  if (!document?.documentElement.contains(range.commonAncestorContainer)) {
    return null;
  }
  const start = boundary(range.startContainer, range.startOffset, document.documentElement);
  const end = boundary(range.endContainer, range.endOffset, document.documentElement);
  if (!start || !end) {
    return null;
  }
  const commonLength = sharedPathLength(start.steps, end.steps);
  const stableCommonLength = Math.min(
    commonLength,
    Math.max(0, start.steps.length - 1),
    Math.max(0, end.steps.length - 1),
  );
  const common = start.steps.slice(0, stableCommonLength).join("");
  const startArm = `${start.steps.slice(stableCommonLength).join("")}:${String(start.offset)}`;
  const endArm = `${end.steps.slice(stableCommonLength).join("")}:${String(end.offset)}`;
  const spineStep = (readingOrderIndex + 1) * 2;
  const context = selectionContext(range, document);
  return {
    cfi: `epubcfi(/6/${String(spineStep)}!${common},${startArm},${endArm})`,
    ...(context.prefix ? { prefix: context.prefix } : {}),
    ...(context.suffix ? { suffix: context.suffix } : {}),
  };
}

function boundary(
  node: Node,
  offset: number,
  documentElement: Element,
): { readonly steps: readonly string[]; readonly offset: number } | null {
  const textBoundary = normalizedTextBoundary(node, offset);
  if (!textBoundary || !documentElement.contains(textBoundary.node)) {
    return null;
  }
  const steps: string[] = [];
  let current: Node | null = textBoundary.node;
  while (current && current !== documentElement) {
    const step = cfiStep(current);
    if (!step) {
      return null;
    }
    steps.unshift(step);
    current = current.parentNode;
  }
  return current === documentElement ? { steps, offset: textBoundary.offset } : null;
}

function normalizedTextBoundary(
  node: Node,
  offset: number,
): { readonly node: Text; readonly offset: number } | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node as Text;
    return offset >= 0 && offset <= text.length ? { node: text, offset } : null;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  if (node.childNodes.length === 0) {
    return null;
  }
  const child = node.childNodes.item(Math.min(offset, Math.max(0, node.childNodes.length - 1)));
  const text = firstTextNode(child);
  return text ? { node: text, offset: offset >= node.childNodes.length ? text.length : 0 } : null;
}

function firstTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return node as Text;
  }
  const walker = node.ownerDocument?.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  return (walker?.nextNode() as Text | null) ?? null;
}

function cfiStep(node: Node): string | null {
  const parent = node.parentNode;
  if (!parent) {
    return null;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const elements: Node[] = [...parent.childNodes].filter(
      (sibling) => sibling.nodeType === Node.ELEMENT_NODE,
    );
    const index = elements.indexOf(node);
    return index >= 0 ? `/${String((index + 1) * 2)}` : null;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    const textNodes: Node[] = [...parent.childNodes].filter(
      (sibling) => sibling.nodeType === Node.TEXT_NODE,
    );
    const index = textNodes.indexOf(node);
    return index >= 0 ? `/${String(index * 2 + 1)}` : null;
  }
  return null;
}

function sharedPathLength(left: readonly string[], right: readonly string[]): number {
  let length = 0;
  while (length < left.length && left[length] === right[length]) {
    length += 1;
  }
  return length;
}

function selectionContext(
  range: Range,
  document: Document,
): { readonly prefix: string; readonly suffix: string } {
  const before = document.createRange();
  before.selectNodeContents(document.body);
  before.setEnd(range.startContainer, range.startOffset);
  const after = document.createRange();
  after.selectNodeContents(document.body);
  after.setStart(range.endContainer, range.endOffset);
  return {
    prefix: before.toString().slice(-CONTEXT_LENGTH),
    suffix: after.toString().slice(0, CONTEXT_LENGTH),
  };
}

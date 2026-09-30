import { matchTextQuote, type TextQuote } from "@mdbase-reader/core";

export type { TextQuote } from "@mdbase-reader/core";

/**
 * Finds a quotation in an element's text, preferring the occurrence whose surrounding text best
 * matches the recorded prefix and suffix. Returns null when the passage is not present.
 */
export function locateTextQuote(root: Element, quote: TextQuote): Range | null {
  return createTextQuoteLocator(root)(quote);
}

/** Reuse an index while a caller guarantees that the root's text has not changed. */
export function createTextQuoteLocator(root: Element): (quote: TextQuote) => Range | null {
  const index = textIndex(root);
  return (quote) => {
    const match = matchTextQuote(index.text, quote);
    return match ? rangeAt(root.ownerDocument, index.nodes, match.start, match.end) : null;
  };
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

function rangeAt(
  document: Document,
  nodes: IndexedText["nodes"],
  start: number,
  end: number,
): Range | null {
  // A start on a node boundary belongs to the node that begins there, not the one ending there;
  // otherwise the range would open with the preceding text's line box.
  const startNode =
    nodes.find((entry) => start >= entry.start && start < entry.end) ??
    nodes.find((entry) => start >= entry.start && start <= entry.end);
  let endNode: IndexedText["nodes"][number] | undefined;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const entry = nodes[index];
    if (entry && end >= entry.start && end <= entry.end) {
      endNode = entry;
      break;
    }
  }
  if (!startNode || !endNode) {
    return null;
  }
  const range = document.createRange();
  range.setStart(startNode.node, start - startNode.start);
  range.setEnd(endNode.node, end - endNode.start);
  return range;
}

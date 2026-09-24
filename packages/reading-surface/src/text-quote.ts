/** The passage a text-quote selector names, e.g. from an annotation's `quote`. */
export interface TextQuote {
  readonly exact: string;
  readonly prefix?: string | undefined;
  readonly suffix?: string | undefined;
}

/**
 * Finds a quotation in an element's text, preferring the occurrence whose surrounding text best
 * matches the recorded prefix and suffix. Returns null when the passage is not present.
 */
export function locateTextQuote(root: Element, quote: TextQuote): Range | null {
  const index = textIndex(root);
  const offsets = quoteOffsets(index.text, quote.exact, quote.prefix, quote.suffix);
  return offsets ? rangeAt(root.ownerDocument, index.nodes, offsets.start, offsets.end) : null;
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
  // A start on a node boundary belongs to the node that begins there, not the one ending there;
  // otherwise the range would open with the preceding text's line box.
  const startNode =
    nodes.find((entry) => start >= entry.start && start < entry.end) ??
    nodes.find((entry) => start >= entry.start && start <= entry.end);
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

import { readingOrderIndexFromCfi } from "./epub-locator.js";

/**
 * Resolve canonical point/range CFIs against inert source DOM, not a reflowed frame.
 * Unsupported extensions fail closed rather than trusting only a package-path regex.
 * The scalar is a DOM-order key, NOT a content length or percentage.
 */
export function epubRangeCfiPoint(
  cfi: string,
  index: number,
  document: Document | undefined,
  edge: "start" | "end",
): number | null {
  if (!document || readingOrderIndexFromCfi(cfi) !== index) {
    return null;
  }
  const match = /^epubcfi\(\/6\/(\d+)!([^!()]+)\)$/u.exec(cfi);
  if (!match?.[2]) {
    return null;
  }
  const arms = match[2].split(",");
  if (arms.length !== 1 && arms.length !== 3) {
    return null;
  }
  const common = arms[0] ?? "";
  if (arms.length === 1) {
    return domPoint(document, common);
  }
  const start = domPoint(document, common + (arms[1] ?? ""));
  const end = domPoint(document, common + (arms[2] ?? ""));
  if (start === null || end === null || start > end) {
    return null;
  }
  return edge === "start" ? start : end;
}

function domPoint(document: Document, path: string): number | null {
  // ID assertions are verified, never used as fuzzy relocation hints. Text assertions,
  // temporal/spatial offsets and indirection need a fuller CFI resolver and are rejected.
  const syntax = /^(?:\/\d+(?:\[[^[\]^,;()!]+\])?)+(?::\d+)?$/u;
  if (!syntax.test(path)) {
    return null;
  }
  const offsetMatch = /:(\d+)$/u.exec(path);
  const offset = offsetMatch?.[1] ? Number(offsetMatch[1]) : 0;
  const steps = path.replace(/:\d+$/u, "").matchAll(/\/(\d+)(?:\[([^\]]+)\])?/gu);
  let node: Node = document.documentElement;
  for (const step of steps) {
    const child = cfiChild(node, Number(step[1]), step[2]);
    if (!child) {
      return null;
    }
    node = child;
  }
  if (!validOffset(node, offset, offsetMatch !== null)) {
    return null;
  }
  return domOrder(document.documentElement, node) + offset;
}

function validOffset(node: Node, offset: number, explicit: boolean): boolean {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    return false;
  }
  return node.nodeType === 3 ? offset <= (node.textContent?.length ?? 0) : !explicit; // Character offsets are only meaningful on text nodes.
}

function cfiChild(node: Node, step: number, assertion: string | undefined): Node | null {
  if (!Number.isSafeInteger(step) || step < 1 || node.nodeType !== 1) {
    return null;
  }
  if (step % 2 === 0) {
    const child = (node as Element).children[step / 2 - 1];
    return child && (assertion === undefined || child.id === assertion) ? child : null;
  }
  if (assertion !== undefined) {
    return null;
  }
  // Odd CFI steps locate text after the indicated number of element siblings.
  let precedingElements = 0;
  const candidates = [...node.childNodes].filter((child) => {
    if (child.nodeType === 1) {
      precedingElements += 1;
    }
    return child.nodeType === 3 && precedingElements === (step - 1) / 2;
  });
  // Adjacent text runs (e.g. around comments) require CFI text-run coalescing.
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

function domOrder(root: Node, target: Node): number {
  let cursor = 0;
  let result = 0;
  const visit = (node: Node): void => {
    if (node === target) {
      result = cursor;
    }
    cursor += 1;
    if (node.nodeType === 3) {
      cursor += node.textContent?.length ?? 0;
    }
    for (const child of node.childNodes) {
      visit(child);
    }
    cursor += 1;
  };
  visit(root);
  return result;
}

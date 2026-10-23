import type { SourceId } from "./identity.js";

/** Inclusive bounds, valid only for the containing document entry's revision. */
export type DocumentRange =
  | {
      readonly kind: "pages";
      readonly start: number;
      readonly end: number;
      readonly labels?: { readonly start?: string; readonly end?: string };
    }
  | {
      readonly kind: "epub-spine";
      readonly start: string;
      readonly end: string;
      readonly start_cfi?: string;
      readonly end_cfi?: string;
    }
  | { readonly kind: "fragment"; readonly start: string; readonly end?: string };

export interface SourceRelation {
  readonly relation: string;
  /** The collection's link syntax, not an ID inferred from link text. */
  readonly target: string;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Unknown kinds and malformed ranges are ignored; callers retain the raw frontmatter. */
export function parseDocumentRange(value: unknown): DocumentRange | undefined {
  const item = object(value);
  switch (item?.["kind"]) {
    case "pages":
      return parsePages(item);
    case "epub-spine":
      return parseSpine(item);
    case "fragment":
      return parseFragment(item);
    default:
      return undefined;
  }
}

function parseLabels(value: unknown): Extract<DocumentRange, { kind: "pages" }>["labels"] {
  const labels = object(value);
  if (
    !labels ||
    (labels["start"] !== undefined && typeof labels["start"] !== "string") ||
    (labels["end"] !== undefined && typeof labels["end"] !== "string")
  ) {
    return undefined;
  }
  return {
    ...(typeof labels["start"] === "string" ? { start: labels["start"] } : {}),
    ...(typeof labels["end"] === "string" ? { end: labels["end"] } : {}),
  };
}

function parsePages(item: Record<string, unknown>): DocumentRange | undefined {
  const { start, end } = item;
  if (
    typeof start !== "number" ||
    !Number.isSafeInteger(start) ||
    start < 0 ||
    typeof end !== "number" ||
    !Number.isSafeInteger(end) ||
    end < start
  ) {
    return undefined;
  }
  const labels = parseLabels(item["labels"]);
  if (item["labels"] !== undefined && !labels) {
    return undefined;
  }
  return { kind: "pages", start, end, ...(labels ? { labels } : {}) };
}

function parseSpine(item: Record<string, unknown>): DocumentRange | undefined {
  const { start, end } = item;
  if (!nonempty(start) || !nonempty(end)) {
    return undefined;
  }
  const startCfi = item["start_cfi"];
  const endCfi = item["end_cfi"];
  if (
    (startCfi !== undefined && !nonempty(startCfi)) ||
    (endCfi !== undefined && !nonempty(endCfi))
  ) {
    return undefined;
  }
  // Href order is defined by the EPUB spine, never lexicographically.
  return {
    kind: "epub-spine",
    start,
    end,
    ...(nonempty(startCfi) ? { start_cfi: startCfi } : {}),
    ...(nonempty(endCfi) ? { end_cfi: endCfi } : {}),
  };
}

function parseFragment(item: Record<string, unknown>): DocumentRange | undefined {
  const { start, end } = item;
  if (
    nonempty(start) &&
    /^#\S+$/u.test(start) &&
    (end === undefined || (nonempty(end) && /^#\S+$/u.test(end)))
  ) {
    return { kind: "fragment", start, ...(end !== undefined ? { end } : {}) };
  }
  return undefined;
}

export function rangeContainsPdfPage(range: DocumentRange, pageIndex: number): boolean {
  return (
    range.kind === "pages" &&
    Number.isSafeInteger(pageIndex) &&
    pageIndex >= range.start &&
    pageIndex <= range.end
  );
}

export function rangeContainsEpubHref(
  range: DocumentRange,
  href: string,
  spine: readonly string[],
): boolean {
  if (range.kind !== "epub-spine") {
    return false;
  }
  const start = spine.indexOf(range.start);
  const end = spine.indexOf(range.end);
  const page = spine.indexOf(href);
  return start >= 0 && end >= start && page >= start && page <= end;
}

export function parseSourceRelations(value: unknown): readonly SourceRelation[] {
  return Array.isArray(value)
    ? value.flatMap((candidate) => {
        const item = object(candidate);
        return item && nonempty(item["relation"]) && nonempty(item["target"])
          ? [{ relation: item["relation"], target: item["target"] }]
          : [];
      })
    : [];
}

export const sourcePartMaxDepth = 32;
export interface SourcePartChain {
  readonly ancestors: readonly SourceId[];
  readonly problem?: "self-reference" | "cycle" | "depth-exceeded";
  readonly missing?: SourceId;
}

/** A missing parent terminates traversal without making the child invalid. */
export function validateSourcePartChain(
  id: SourceId,
  sources: ReadonlyMap<SourceId, { readonly partOf?: SourceId }>,
  maxDepth = sourcePartMaxDepth,
): SourcePartChain {
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0) {
    throw new Error("Invalid source part depth bound.");
  }
  const ancestors: SourceId[] = [];
  const seen = new Set([id]);
  let current = id;
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const source = sources.get(current);
    if (!source) {
      return { ancestors, missing: current };
    }
    const parent = source.partOf;
    if (!parent) {
      return { ancestors };
    }
    if (seen.has(parent)) {
      return { ancestors, problem: parent === current ? "self-reference" : "cycle" };
    }
    if (depth === maxDepth) {
      return { ancestors, problem: "depth-exceeded" };
    }
    ancestors.push(parent);
    seen.add(parent);
    current = parent;
  }
  return { ancestors };
}

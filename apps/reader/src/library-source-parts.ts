import { validateSourcePartChain, type SourceId, type SourceSummary } from "@mdbase-reader/core";

export function libraryPartKey(
  key: string,
  source: SourceSummary,
  row: LibraryPartRow | undefined,
): "expand" | "collapse" | "parent" | "child" | undefined {
  if (key === "ArrowRight" && row?.expandable) {
    return row.expanded ? "child" : "expand";
  }
  if (key === "ArrowLeft") {
    return row?.expandable && row.expanded ? "collapse" : source.partOf ? "parent" : undefined;
  }
  return undefined;
}

export interface LibraryPartRow {
  readonly depth: number;
  readonly context?: string;
  readonly diagnostic?: string;
  readonly expandable: boolean;
  readonly expanded: boolean;
}

/** Bounded graph traversal; filters determine membership, nesting only changes presentation. */
// Each independent external-data fault must remain visible; traversal stays depth-bounded.
// eslint-disable-next-line complexity
export function librarySourceParts(
  matches: readonly SourceSummary[],
  library: readonly SourceSummary[],
  collapsed: ReadonlySet<SourceId>,
  flat: boolean,
  complete: boolean,
): {
  readonly sources: readonly SourceSummary[];
  readonly rows: ReadonlyMap<SourceId, LibraryPartRow>;
} {
  const byId = new Map([...library, ...matches].map((source) => [source.id, source]));
  const included = new Set(matches.map(({ id }) => id));
  const children = new Map<SourceId, SourceSummary[]>();
  const roots: SourceSummary[] = [];
  const rows = new Map<SourceId, LibraryPartRow>();
  for (const source of matches) {
    const chain = validateSourcePartChain(source.id, byId);
    const relations = source.relations?.filter(({ relation }) => relation === "part-of") ?? [];
    const ambiguous = new Set(relations.map(({ target }) => target)).size > 1;
    const diagnostic = ambiguous
      ? `Multiple parents: ${relations.map(({ target }) => target).join("; ")}`
      : chain.problem
        ? `Parent relation: ${chain.problem}`
        : chain.missing
          ? complete
            ? "Missing parent — repair the part-of link"
            : "Parent not indexed — coverage is partial"
          : relations.length && !source.partOf
            ? `Unresolved parent: ${relations.map(({ target }) => target).join("; ")}`
            : undefined;
    const parent = source.partOf && byId.get(source.partOf);
    rows.set(source.id, {
      depth: 0,
      ...(parent ? { context: `in ${parent.title}` } : {}),
      ...(diagnostic ? { diagnostic } : {}),
      expandable: false,
      expanded: false,
    });
    if (!flat && !diagnostic && source.partOf && included.has(source.partOf)) {
      const siblings = children.get(source.partOf) ?? [];
      siblings.push(source);
      children.set(source.partOf, siblings);
    } else {
      roots.push(source);
    }
  }
  const sources: SourceSummary[] = [];
  const stack = roots.map((source) => ({ source, depth: 0 })).reverse();
  while (stack.length) {
    const item = stack.pop();
    if (!item) {
      break;
    }
    const { source, depth } = item;
    const parts = children.get(source.id) ?? [];
    const expanded = !collapsed.has(source.id);
    rows.set(source.id, { ...rows.get(source.id), depth, expandable: parts.length > 0, expanded });
    sources.push(source);
    if (expanded) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        if (part) {
          stack.push({ source: part, depth: depth + 1 });
        }
      }
    }
  }
  return { sources, rows };
}

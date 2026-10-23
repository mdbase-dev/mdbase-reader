import type { SourceId, SourceSummary } from "@mdbase-reader/core";

/** Resolved identities only. A visited set bounds external cycles; no link-text parsing. */
export function sourceAnnotationFamily(
  source: SourceSummary,
  sources: readonly SourceSummary[],
): readonly SourceSummary[] {
  const byId = new Map(sources.map((item) => [item.id, item]));
  let root = source;
  const ancestors = new Set<SourceId>([source.id]);
  while (root.partOf && !ancestors.has(root.partOf)) {
    const parent = byId.get(root.partOf);
    if (!parent) {
      break;
    }
    ancestors.add(parent.id);
    root = parent;
  }
  const children = new Map<SourceId, SourceSummary[]>();
  for (const item of sources) {
    if (item.partOf) {
      children.set(item.partOf, [...(children.get(item.partOf) ?? []), item]);
    }
  }
  const result: SourceSummary[] = [];
  const visited = new Set<SourceId>();
  const queue = [root];
  for (const item of queue) {
    if (visited.has(item.id)) {
      continue;
    }
    visited.add(item.id);
    result.push(item);
    queue.push(...(children.get(item.id) ?? []));
  }
  return result;
}

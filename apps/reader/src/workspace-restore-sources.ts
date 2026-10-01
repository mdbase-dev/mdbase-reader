import type { SourceId } from "@mdbase-reader/core";

/** Missing from a partial index means unknown, not deleted. These IDs remain
 * subject to the normal source read and authorization checks when activated. */
export function sourcesForWorkspaceRestore(
  known: ReadonlySet<SourceId>,
  serialized: string,
  complete: boolean,
): ReadonlySet<SourceId> {
  if (complete) {
    return known;
  }
  const retained = new Set(known);
  const pending: unknown[] = [JSON.parse(serialized) as unknown];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object") {
      continue;
    }
    const object = value as Record<string, unknown>;
    if (object["kind"] === "source" && typeof object["sourceId"] === "string") {
      retained.add(object["sourceId"] as SourceId);
    }
    pending.push(...Object.values(object));
  }
  return retained;
}

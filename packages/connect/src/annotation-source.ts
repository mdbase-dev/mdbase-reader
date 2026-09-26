import { sourceId, type SourceId } from "@mdbase-reader/core";

import { outcomeValue } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";

export function annotationSourceResolver(
  client: ReaderConnectClient,
): (value: unknown) => Promise<SourceId> {
  const idsByPath = new Map<string, Promise<SourceId>>();
  return async (value) => {
    const reference = annotationSourceReference(value);
    if (!reference) {
      throw new Error("Annotation source is missing.");
    }
    const path = annotationSourcePath(reference);
    if (!path) {
      return annotationSourceId(value);
    }
    let pending = idsByPath.get(path);
    if (!pending) {
      pending = (async () => {
        const record = outcomeValue(await client.read({ path }), "resolve annotation source");
        const id = stringField(record.effectiveFrontmatter["id"]);
        if (!id) {
          throw new Error(`Source ${path} has no stable ID.`);
        }
        return sourceId(id);
      })().finally(() => {
        // Coalesce simultaneous reads only. A later call must see renamed/replaced records.
        idsByPath.delete(path);
      });
      idsByPath.set(path, pending);
    }
    return pending;
  };
}

export function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** A link target is a record reference, not necessarily its stable ID. */
export function annotationSourceReference(value: unknown): string | undefined {
  const raw = stringField(value);
  if (!raw) {
    return undefined;
  }
  return /^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/u.exec(raw)?.[1] ?? raw;
}

export function annotationSourcePath(reference: string): string | undefined {
  return reference.includes("/") || reference.endsWith(".md")
    ? reference.endsWith(".md")
      ? reference
      : `${reference}.md`
    : undefined;
}

export function annotationSourceId(value: unknown, resolved?: SourceId): SourceId {
  const reference = annotationSourceReference(value);
  if (!reference) {
    throw new Error("Annotation source is missing.");
  }
  if (resolved) {
    return resolved;
  }
  if (annotationSourcePath(reference)) {
    throw new Error("Annotation source path must be resolved to a record ID before mapping.");
  }
  return sourceId(reference);
}

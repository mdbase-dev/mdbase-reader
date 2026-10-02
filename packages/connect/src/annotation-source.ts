import { sourceId, type ReaderRequestOptions, type SourceId } from "@mdbase-reader/core";

import { outcomeValue } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { QueryInput, QueryRecord } from "@mdbase-dev/connect";

/**
 * mdbase resolves an annotation's `source` link, so Reader never guesses a link's target from its
 * text: a link can name a path, a shortened filename, or (where the collection configures an ID
 * field) an ID, and mdbase alone knows which record it reaches.
 */
const resolvedSource = "reader_source_id";

/** Adds each annotation's resolved source ID to a query's result values. */
export function withResolvedSource(input: QueryInput): QueryInput {
  return {
    ...input,
    projections: {
      ...input.projections,
      [resolvedSource]: {
        expression:
          "has(record.source) && source != null && source.asFile() != null ? source.asFile().?id.orValue(null) : null",
      },
    },
    select: [...(input.select ?? []), `projection.${resolvedSource}`],
  };
}

/**
 * The source an annotation belongs to: the record its link resolves to, or for a legacy bare
 * reference that resolves to no record, the ID it was written as. Undefined for a broken link.
 */
export function annotationSourceFromResult(
  record: Pick<QueryRecord, "effectiveFrontmatter" | "frontmatter" | "values">,
): SourceId | undefined {
  const resolved = stringField(record.values?.[resolvedSource]);
  if (resolved) {
    return sourceId(resolved);
  }
  return legacySourceId((record.effectiveFrontmatter ?? record.frontmatter)?.["source"]);
}

/** Resolves one annotation's source through mdbase. */
export async function resolveAnnotationSource(
  client: ReaderConnectClient,
  path: string,
  options: ReaderRequestOptions = {},
): Promise<SourceId> {
  for await (const outcome of client.queryPages(
    withResolvedSource({
      types: ["reader-annotation"],
      where: `file.path == ${JSON.stringify(path)}`,
      select: ["source"],
      frontmatterMode: "effective",
    }),
    { ...options, firstPageSize: 1, pageSize: 1 },
  )) {
    const [record] = outcomeValue(outcome, "resolve annotation source").results;
    const source = record ? annotationSourceFromResult(record) : undefined;
    if (source) {
      return source;
    }
  }
  throw new Error(`The source link in annotation ${path} does not resolve to a record.`);
}

/**
 * Older annotations name their source by bare ID. In a collection without an mdbase ID field such
 * a link resolves to no record, so the ID is taken as written. A path never is.
 */
export function legacySourceId(value: unknown): SourceId | undefined {
  const reference = annotationSourceReference(value);
  return reference && !annotationSourcePath(reference) ? sourceId(reference) : undefined;
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

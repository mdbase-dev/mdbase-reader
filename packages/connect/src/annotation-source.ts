import { sourceId, type ReaderRequestOptions, type SourceId } from "@mdbase-reader/core";

import {
  mapConcurrent,
  readerConnectBulkConcurrency,
  resolveLinksFrom,
} from "./repository-client.js";

import type { MdbaseClient, RecordView } from "@mdbase-dev/sdk";

/**
 * mdbase resolves an annotation's `source` link, so Reader never guesses a link's target from its
 * text: a link can name a path or a shortened filename, and mdbase alone knows which record it
 * reaches. Links go to the replica's link resolver rather than a link-following query, whose
 * budget refuses once a collection holds over 1000 records.
 */

/** The `source` value as written. */
export function annotationSourceValue(
  record: Pick<RecordView, "effective" | "frontmatter">,
): unknown {
  return (record.effective ?? record.frontmatter)["source"];
}

/** Resolves one annotation's source through mdbase. */
export async function resolveAnnotationSource(
  client: MdbaseClient,
  path: string,
  options: ReaderRequestOptions = {},
): Promise<SourceId> {
  const source = await annotationSourceAt(client, path, options);
  if (source) {
    return source;
  }
  throw new Error(`The source link in annotation ${path} does not resolve to a record.`);
}

export async function annotationSourceAt(
  client: MdbaseClient,
  path: string,
  options: ReaderRequestOptions = {},
): Promise<SourceId | undefined> {
  const record = await client.find(
    { path },
    { include: { effective: true }, ...(options.signal ? { signal: options.signal } : {}) },
  );
  if (!record?.types.includes("reader-annotation")) {
    return undefined;
  }
  const reference = annotationSourceValue(record);
  return (await resolveAnnotationSources(client, [{ path, reference }], options)).get(path);
}

/**
 * Annotations' sources, by annotation path: each `source` link is resolved where it is written
 * and the record it reaches gives the source ID; a link that reaches no record is taken as a
 * legacy bare ID. `ids` caches source IDs by record path across calls.
 */
export async function resolveAnnotationSources(
  client: MdbaseClient,
  annotations: readonly { readonly path: string; readonly reference: unknown }[],
  options: ReaderRequestOptions = {},
  ids = new Map<string, string | undefined>(),
): Promise<Map<string, SourceId | undefined>> {
  const targets = await sourceLinkTargets(client, annotations, options);
  await readSourceIds(client, [...new Set(targets.values())], ids, options);
  return new Map(
    annotations.map(({ path, reference }) => {
      const target = targets.get(path);
      const id = target ? ids.get(target) : undefined;
      return [path, id ? sourceId(id) : legacySourceId(reference)];
    }),
  );
}

/** The record path each annotation's `source` link reaches, by annotation path. */
async function sourceLinkTargets(
  client: MdbaseClient,
  annotations: readonly { readonly path: string; readonly reference: unknown }[],
  options: ReaderRequestOptions,
): Promise<Map<string, string>> {
  // A link resolves against its note's folder alone (spec 08), so one request serves a folder.
  const folders = new Map<string, { from: string; paths: string[]; links: string[] }>();
  for (const { path, reference } of annotations) {
    const link = linkOccurrence(reference);
    if (!link) {
      continue;
    }
    const folder = path.slice(0, Math.max(0, path.lastIndexOf("/")));
    const group = folders.get(folder) ?? { from: path, paths: [], links: [] };
    group.paths.push(path);
    group.links.push(link);
    folders.set(folder, group);
  }
  const targets = new Map<string, string>();
  for (const { from, paths, links } of folders.values()) {
    const resolved = await resolveLinksFrom(client, from, links, options);
    for (const [index, path] of paths.entries()) {
      const target = resolved[index];
      if (target?.kind === "record" && target.path) {
        targets.set(path, target.path);
      }
    }
  }
  return targets;
}

/** Adds the stable ID of each record at `paths` not yet in `ids`. */
async function readSourceIds(
  client: MdbaseClient,
  paths: readonly string[],
  ids: Map<string, string | undefined>,
  options: ReaderRequestOptions,
): Promise<void> {
  const unknown = paths.filter((path) => !ids.has(path));
  const records = await mapConcurrent(unknown, readerConnectBulkConcurrency, (path) =>
    client.find(
      { path },
      { include: { effective: true }, ...(options.signal ? { signal: options.signal } : {}) },
    ),
  );
  for (const [index, path] of unknown.entries()) {
    const record = records[index];
    ids.set(path, record ? stringField((record.effective ?? record.frontmatter)["id"]) : undefined);
  }
}

/** A frontmatter link as the resolver takes it; a bare value is read as a wikilink target. */
function linkOccurrence(value: unknown): string | undefined {
  const raw = stringField(value);
  if (!raw) {
    return undefined;
  }
  return /^!?\[\[[^\]]+\]\]$|^!?\[[^\]]*\]\([^)]+\)$/u.test(raw) ? raw : `[[${raw}]]`;
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

import { sourceId, type ReaderRequestOptions, type SourceId } from "@mdbase-reader/core";

import {
  mapConcurrent,
  readerConnectBulkConcurrency,
  resolveLinksFrom,
} from "./repository-client.js";

import type { MdbaseClient, RecordView } from "@mdbase-dev/sdk";

export type AnnotationLinkTargets = Map<string, Map<string, string | undefined>>;

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
  ids = new Map<string, SourceId | undefined>(),
  linksByFolder: AnnotationLinkTargets = new Map(),
): Promise<Map<string, SourceId | undefined>> {
  const targets = await sourceLinkTargets(client, annotations, options, linksByFolder);
  await readSourceIds(client, [...new Set(targets.values())], ids, options);
  const owners = new Map<string, SourceId | undefined>();
  for (const { path, reference } of annotations) {
    const target = targets.get(path);
    const id = target ? ids.get(target) : undefined;
    owners.set(path, id ?? legacySourceId(reference));
  }
  return owners;
}

/** The record path each annotation's `source` link reaches, by annotation path. */
async function sourceLinkTargets(
  client: MdbaseClient,
  annotations: readonly { readonly path: string; readonly reference: unknown }[],
  options: ReaderRequestOptions,
  linksByFolder: AnnotationLinkTargets,
): Promise<Map<string, string>> {
  // A link resolves against its note's folder alone (spec 08). Ask once per distinct
  // occurrence, including across pages when the caller supplies a search-scoped cache.
  const folders = new Map<string, { from: string; pathsByLink: Map<string, string[]> }>();
  const targets = new Map<string, string>();
  for (const { path, reference } of annotations) {
    const link = linkOccurrence(reference);
    if (!link) {
      continue;
    }
    const folder = path.slice(0, Math.max(0, path.lastIndexOf("/")));
    const known = linksByFolder.get(folder);
    if (known?.has(link)) {
      const target = known.get(link);
      if (target) {
        targets.set(path, target);
      }
      continue;
    }
    const group = folders.get(folder) ?? { from: path, pathsByLink: new Map<string, string[]>() };
    const paths = group.pathsByLink.get(link);
    if (paths) {
      paths.push(path);
    } else {
      group.pathsByLink.set(link, [path]);
    }
    folders.set(folder, group);
  }
  for (const [folder, { from, pathsByLink }] of folders) {
    const links = [...pathsByLink.keys()];
    const resolved = await resolveLinksFrom(client, from, links, options);
    const known = linksByFolder.get(folder) ?? new Map<string, string | undefined>();
    for (const [index, [link, paths]] of [...pathsByLink].entries()) {
      const resolution = resolved[index];
      const target = resolution?.kind === "record" ? resolution.path : undefined;
      known.set(link, target);
      if (target) {
        for (const path of paths) {
          targets.set(path, target);
        }
      }
    }
    linksByFolder.set(folder, known);
  }
  return targets;
}

/** Adds the stable ID of each record at `paths` not yet in `ids`. */
async function readSourceIds(
  client: MdbaseClient,
  paths: readonly string[],
  ids: Map<string, SourceId | undefined>,
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
    const id = record && stringField((record.effective ?? record.frontmatter)["id"]);
    ids.set(path, id ? sourceId(id) : undefined);
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

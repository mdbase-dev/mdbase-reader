import {
  sourceLink,
  sourcePartMaxDepth,
  validateSourcePartChain,
  type CollectionId,
  type Source,
  type SourceId,
  type SourcePartChain,
  type SourceRepository,
  type ReaderRequestOptions,
} from "@mdbase-reader/core";

import { sourceFromDocument } from "./mapping.js";
import { outcomeValue } from "./repository-client.js";
import { documentRangePatch, sourcePartOfPatch } from "./source-frontmatter.js";
import { resolveSourcePartOf } from "./source-part-links.js";

import type { ReaderConnectClient } from "./repository-client.js";

export async function checkSourcePartChain(
  repository: Pick<SourceRepository, "get">,
  collection: CollectionId,
  id: SourceId,
  proposed?: SourceId | null,
): Promise<SourcePartChain> {
  const sources = new Map<SourceId, { readonly partOf?: SourceId }>();
  let current: SourceId | undefined = id;
  for (let depth = 0; current && depth <= sourcePartMaxDepth; depth += 1) {
    if (sources.has(current)) {
      break;
    }
    if (current === id && proposed !== undefined) {
      sources.set(id, proposed ? { partOf: proposed } : {});
      current = proposed ?? undefined;
    } else {
      const source = await repository.get(collection, current);
      if (!source) {
        break;
      }
      sources.set(current, source);
      current = source.partOf;
    }
  }
  return validateSourcePartChain(id, sources);
}

export async function writeSourcePartOf(
  client: ReaderConnectClient,
  repository: Pick<SourceRepository, "get">,
  input: Parameters<NonNullable<SourceRepository["setSourcePartOf"]>>[0],
): Promise<Source> {
  const current = await repository.get(input.collectionId, input.sourceId);
  if (!current) {
    throw new Error("Source not found.");
  }
  if (current.recordRevision !== input.expectedRevision) {
    throw new Error("Source revision changed.");
  }
  const chain = await checkSourcePartChain(
    repository,
    input.collectionId,
    input.sourceId,
    input.parentId,
  );
  if (chain.problem) {
    throw new Error(`Invalid part-of relation: ${chain.problem}.`);
  }
  const parent = input.parentId ? await repository.get(input.collectionId, input.parentId) : null;
  if (input.parentId && !parent) {
    throw new Error("Parent source not found.");
  }
  const updated = outcomeValue(
    await client.update({
      path: current.path,
      ifRevision: input.expectedRevision,
      patch: sourcePartOfPatch(current.frontmatter, parent ? sourceLink(parent) : null),
      includeDocument: true,
    }),
    "set source parent",
  );
  return sourceFromDocument(input.collectionId, updated, parent?.id);
}

export async function writeDocumentRange(
  client: ReaderConnectClient,
  repository: Pick<SourceRepository, "get">,
  input: Parameters<NonNullable<SourceRepository["setDocumentRange"]>>[0],
): Promise<Source> {
  const current = await repository.get(input.collectionId, input.sourceId);
  if (!current) {
    throw new Error("Source not found.");
  }
  if (current.recordRevision !== input.expectedRevision) {
    throw new Error("Source revision changed.");
  }
  const updated = outcomeValue(
    await client.update({
      path: current.path,
      ifRevision: input.expectedRevision,
      patch: documentRangePatch(
        current.frontmatter,
        input.documentFileId,
        input.expectedDocumentRevision,
        input.range,
      ),
      includeDocument: true,
    }),
    "set document range",
  );
  return sourceFromDocument(input.collectionId, updated, current.partOf);
}

/** Avoid a resolution query for the overwhelmingly common source with no parent. */
export async function resolvedSource(
  client: ReaderConnectClient,
  source: Source,
  options: ReaderRequestOptions = {},
): Promise<Source> {
  if (!source.relations?.some((relation) => relation.relation === "part-of")) {
    return source;
  }
  const partOf = await resolveSourcePartOf(client, source.path, options);
  return { ...source, ...(partOf ? { partOf } : {}) };
}

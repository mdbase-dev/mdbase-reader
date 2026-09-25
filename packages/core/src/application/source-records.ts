import { DomainError } from "../domain/errors.js";

import { authoredImportFields, planRepresentation } from "./import-source-file.js";
import {
  normalizeOptionalText,
  normalizeTitle,
  sourceRecordPaths,
  webUrl,
} from "./source-import-values.js";

import type { ImportSourceFileDependencies } from "./import-source-file.js";
import type {
  SourceFileAttachmentRequest,
  SourceImportOptions,
  SourceRecordCreationRequest,
} from "./ports.js";
import type { Source } from "../domain/source.js";

/**
 * Creates a source with no document: a citation or reading-list entry. Files can be attached
 * later with {@link attachSourceFile}.
 */
export async function createSourceRecord(
  dependencies: ImportSourceFileDependencies,
  request: SourceRecordCreationRequest,
  options: SourceImportOptions = {},
): Promise<Source> {
  options.signal?.throwIfAborted();
  const sourceId = dependencies.ids.source();
  const title = normalizeTitle(request.title);
  return dependencies.imports.commitFile(
    {
      collectionId: request.collectionId,
      sourceId,
      title,
      kind: normalizeOptionalText(request.kind, 100) ?? "document",
      savedAt: dependencies.clock.now(),
      ...sourceRecordPaths(title, sourceId),
      representations: [],
      ...authoredImportFields(request),
    },
    options,
  );
}

/**
 * Uploads a file and adds it to an existing source. The first file becomes the primary
 * document; later ones are alternatives. Bytes already stored in any source are refused, as
 * they are for a new import.
 */
export async function attachSourceFile(
  dependencies: ImportSourceFileDependencies,
  request: SourceFileAttachmentRequest,
  options: SourceImportOptions = {},
): Promise<Source> {
  options.signal?.throwIfAborted();
  const { source } = request;
  if (!dependencies.imports.attachFile) {
    throw new DomainError(
      "unsupported-source-attachment",
      "This collection cannot attach files to existing sources.",
    );
  }
  const representation = await planRepresentation(dependencies, source.id, {
    name: request.name,
    ...(request.declaredMediaType ? { declaredMediaType: request.declaredMediaType } : {}),
    bytes: request.bytes,
    role: source.documents.length === 0 ? "primary" : "alternative",
  });
  if (source.documents.some(({ revision }) => revision === representation.contentDigest)) {
    throw new DomainError("duplicate-source-import", "This file is already attached here.");
  }
  const duplicate = await dependencies.imports.findExactDuplicate(
    source.collectionId,
    [representation.contentDigest],
    options,
  );
  options.signal?.throwIfAborted();
  if (duplicate) {
    throw new DomainError(
      "duplicate-source-import",
      `These exact bytes are already stored in “${duplicate.title}”.`,
    );
  }
  return dependencies.imports.attachFile(
    {
      collectionId: source.collectionId,
      sourceId: source.id,
      recordPath: source.path,
      representation,
      retrievedAt: dependencies.clock.now(),
      ...(request.originUrl ? { originUrl: webUrl(request.originUrl) } : {}),
    },
    options,
  );
}

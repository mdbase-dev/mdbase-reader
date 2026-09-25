import { DomainError } from "../domain/errors.js";

import { detectDocumentFormat, mediaTypeFor } from "./source-document-format.js";
import {
  normalizeOptionalText,
  normalizeTitle,
  safeFileName,
  safeFileStem,
  titleFromFileName,
  validateCapture,
  validateMetadata,
  webUrl,
} from "./source-import-values.js";

import type {
  Clock,
  ContentHasher,
  PlannedSourceFileImport,
  PlannedSourceRepresentation,
  ReaderIdGenerator,
  SourceCaptureProvenance,
  SourceDocumentFormat,
  SourceFileImportRequest,
  SourceImportOptions,
  SourceImportRepository,
} from "./ports.js";
import type { SourceId } from "../domain/identity.js";
import type { Source } from "../domain/source.js";

export interface ImportSourceFileDependencies {
  readonly clock: Clock;
  readonly hasher: ContentHasher;
  readonly ids: ReaderIdGenerator;
  readonly imports: SourceImportRepository;
}

export async function importSourceFile(
  dependencies: ImportSourceFileDependencies,
  request: SourceFileImportRequest,
  options: SourceImportOptions = {},
): Promise<Source> {
  options.signal?.throwIfAborted();
  const plan = await planSourceFileImport(dependencies, request, dependencies.ids.source());
  const totalBytes = plan.representations.reduce((sum, item) => sum + item.bytes.byteLength, 0);
  options.onProgress?.({
    phase: "checking",
    completedBytes: totalBytes,
    totalBytes,
    fileIndex: 0,
    fileCount: plan.representations.length,
  });
  const digests = plan.representations.map(({ contentDigest }) => contentDigest);
  // Stored summaries are only arrival hints and cannot settle current authority.
  // This lookup and commit remain separate, so concurrent imports can still race
  // until storage provides atomic uniqueness.
  const duplicate = await dependencies.imports.findExactDuplicate(
    plan.collectionId,
    digests,
    options,
  );
  options.signal?.throwIfAborted();
  if (duplicate) {
    throw new DomainError(
      "duplicate-source-import",
      `These exact bytes are already stored in “${duplicate.title}”.`,
    );
  }
  return dependencies.imports.commitFile(plan, options);
}

async function planSourceFileImport(
  dependencies: Pick<ImportSourceFileDependencies, "clock" | "hasher" | "ids">,
  request: SourceFileImportRequest,
  sourceIdentity: SourceId,
): Promise<PlannedSourceFileImport> {
  if (request.bytes.byteLength === 0) {
    throw new DomainError("invalid-source-import", "The selected file is empty.");
  }
  const originalName = safeFileName(request.name);
  const format = detectDocumentFormat(originalName, request.declaredMediaType, request.bytes);
  const title = normalizeTitle(request.title ?? titleFromFileName(originalName));
  const capture = validatedCaptureFor(request, format);
  const primary = await planRepresentation(dependencies, sourceIdentity, {
    name: originalName,
    ...(request.declaredMediaType ? { declaredMediaType: request.declaredMediaType } : {}),
    bytes: request.bytes,
    role: "primary",
    ...(request.archive ? { derivedFromRole: "archive" as const } : {}),
  });
  const archive = request.archive
    ? await planRepresentation(dependencies, sourceIdentity, {
        name: request.archive.name,
        declaredMediaType: "text/html",
        bytes: request.archive.bytes,
        role: "archive",
      })
    : null;
  if (archive && archive.format !== "html") {
    throw new DomainError("invalid-source-import", "A web archive must contain HTML bytes.");
  }
  if (archive?.filePath === primary.filePath) {
    throw new DomainError(
      "invalid-source-import",
      "The readable page and immutable archive need distinct filenames.",
    );
  }
  return {
    collectionId: request.collectionId,
    sourceId: sourceIdentity,
    title,
    kind: normalizeOptionalText(request.kind, 100) ?? (capture ? "webpage" : "document"),
    savedAt: dependencies.clock.now(),
    recordPath: `sources/${sourceIdentity}.md`,
    representations: archive ? [primary, archive] : [primary],
    ...authoredImportFields(request),
    ...(capture ? { capture } : {}),
  };
}

/** Fields a new source takes from the request whether or not it has a document. */
export function authoredImportFields(
  request: Pick<SourceFileImportRequest, "body" | "tags" | "metadata" | "url">,
): Pick<PlannedSourceFileImport, "body" | "tags" | "metadata" | "url"> {
  return {
    ...(request.body !== undefined ? { body: request.body } : {}),
    ...(request.tags
      ? { tags: [...new Set(request.tags.map((tag) => tag.trim()).filter(Boolean))] }
      : {}),
    ...(request.metadata ? { metadata: validateMetadata(request.metadata) } : {}),
    ...(request.url ? { url: webUrl(request.url) } : {}),
  };
}

function validatedCaptureFor(
  request: SourceFileImportRequest,
  format: SourceDocumentFormat,
): SourceCaptureProvenance | undefined {
  const capture = request.capture ? validateCapture(request.capture) : undefined;
  if (capture && format !== "html") {
    throw new DomainError("invalid-source-import", "Web captures must contain an HTML document.");
  }
  if (request.archive && !capture) {
    throw new DomainError(
      "invalid-source-import",
      "An immutable archive can only accompany a web capture.",
    );
  }
  return capture;
}

export async function planRepresentation(
  dependencies: Pick<ImportSourceFileDependencies, "hasher" | "ids">,
  sourceIdentity: SourceId,
  input: {
    readonly name: string;
    readonly declaredMediaType?: string;
    readonly bytes: Uint8Array;
    readonly role: PlannedSourceRepresentation["role"];
    readonly derivedFromRole?: "archive";
  },
): Promise<PlannedSourceRepresentation> {
  if (input.bytes.byteLength === 0) {
    throw new DomainError("invalid-source-import", "The selected file is empty.");
  }
  const originalName = safeFileName(input.name);
  const format = detectDocumentFormat(originalName, input.declaredMediaType, input.bytes);
  const mediaType = mediaTypeFor(format);
  const storedName = `${safeFileStem(originalName)}.${format}`;
  return {
    transferId: dependencies.ids.mutation(),
    role: input.role,
    format,
    mediaType,
    contentDigest: await dependencies.hasher.sha256(input.bytes),
    originalName,
    filePath: `files/reader/${sourceIdentity}/${storedName}`,
    bytes: input.bytes,
    ...(input.derivedFromRole ? { derivedFromRole: input.derivedFromRole } : {}),
  };
}

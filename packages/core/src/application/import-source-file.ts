import { DomainError } from "../domain/errors.js";

import { detectDocumentFormat, mediaTypeFor } from "./source-document-format.js";

import type {
  Clock,
  ContentHasher,
  PlannedSourceFileImport,
  PlannedSourceRepresentation,
  ReaderIdGenerator,
  SourceCaptureProvenance,
  SourceDocumentFormat,
  SourceFileImportRequest,
  SourceImportMetadata,
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
  const duplicate = await dependencies.imports.findExactDuplicate(
    plan.collectionId,
    plan.representations.map(({ contentDigest }) => contentDigest),
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
    kind: capture ? "webpage" : "document",
    savedAt: dependencies.clock.now(),
    recordPath: `sources/${sourceIdentity}.md`,
    representations: archive ? [primary, archive] : [primary],
    ...(capture ? { capture } : {}),
    ...(request.metadata ? { metadata: validateMetadata(request.metadata) } : {}),
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

async function planRepresentation(
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

function validateCapture(
  capture: NonNullable<SourceFileImportRequest["capture"]>,
): NonNullable<SourceFileImportRequest["capture"]> {
  const submittedUrl = httpsUrl(capture.submittedUrl);
  const canonicalUrl = httpsUrl(capture.canonicalUrl);
  return { submittedUrl, canonicalUrl, retrievedAt: capture.retrievedAt };
}

function validateMetadata(metadata: SourceImportMetadata): SourceImportMetadata {
  const authors = metadata.authors
    ?.map((author) => normalizeOptionalText(author, 300))
    .filter((author): author is string => author !== undefined);
  const published = normalizeOptionalText(metadata.published, 100);
  const description = normalizeOptionalText(metadata.description, 2_000);
  const language = normalizeOptionalText(metadata.language, 100);
  const site = normalizeOptionalText(metadata.site, 300);
  return {
    ...(authors?.length ? { authors } : {}),
    ...(published ? { published } : {}),
    ...(description ? { description } : {}),
    ...(language ? { language } : {}),
    ...(site ? { site } : {}),
  };
}

function normalizeOptionalText(value: string | undefined, maximum: number): string | undefined {
  const normalized = value?.replace(/\s+/gu, " ").trim().slice(0, maximum);
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function httpsUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DomainError(
      "invalid-source-import",
      "Web capture provenance contains an invalid URL.",
    );
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new DomainError(
      "invalid-source-import",
      "Web capture provenance must use public HTTPS URLs.",
    );
  }
  url.hash = "";
  return url.href;
}

function safeFileName(value: string): string {
  const leaf = value.replaceAll("\\", "/").split("/").at(-1)?.trim() ?? "";
  const clean = Array.from(leaf)
    .filter((character) => character.charCodeAt(0) > 31 && character !== "\u007f")
    .join("");
  if (!clean || clean === "." || clean === "..") {
    throw new DomainError("invalid-source-import", "The selected file needs a valid filename.");
  }
  return clean;
}

function safeFileStem(name: string): string {
  const stem = name.replace(/\.[^.]+$/u, "");
  const safe = stem
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, "-")
    .replace(/^[._-]+|[._-]+$/gu, "")
    .slice(0, 96);
  return safe.length > 0 ? safe : "document";
}

function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/u, "").replace(/[_-]+/gu, " ");
}

function normalizeTitle(value: string): string {
  const title = value.trim().replace(/\s+/gu, " ");
  if (!title) {
    throw new DomainError("invalid-source-import", "The source needs a title.");
  }
  return title;
}

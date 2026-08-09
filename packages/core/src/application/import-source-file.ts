import { DomainError } from "../domain/errors.js";

import type {
  Clock,
  ContentHasher,
  PlannedSourceFileImport,
  ReaderIdGenerator,
  SourceDocumentFormat,
  SourceFileImportRequest,
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
): Promise<Source> {
  const plan = await planSourceFileImport(dependencies, request, dependencies.ids.source());
  return dependencies.imports.commitFile(plan);
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
  const mediaType = mediaTypeFor(format);
  const title = normalizeTitle(request.title ?? titleFromFileName(originalName));
  const storedName = `${safeFileStem(originalName)}.${format}`;
  const contentDigest = await dependencies.hasher.sha256(request.bytes);
  return {
    collectionId: request.collectionId,
    sourceId: sourceIdentity,
    mutationId: dependencies.ids.mutation(),
    title,
    kind: "document",
    format,
    mediaType,
    savedAt: dependencies.clock.now(),
    contentDigest,
    originalName,
    recordPath: `sources/${sourceIdentity}.md`,
    filePath: `files/reader/${sourceIdentity}/${storedName}`,
    bytes: request.bytes,
  };
}

export function detectDocumentFormat(
  name: string,
  declaredMediaType: string | undefined,
  bytes: Uint8Array,
): SourceDocumentFormat {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return "pdf";
  }
  const normalizedType = declaredMediaType?.split(";", 1)[0]?.trim().toLocaleLowerCase();
  const extension = fileExtension(name);
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (extension === "epub" || normalizedType === "application/epub+zip") {
      return "epub";
    }
    throw unsupported(name);
  }
  if (looksLikeHtml(bytes)) {
    return "html";
  }
  throw unsupported(name);
}

function looksLikeHtml(bytes: Uint8Array): boolean {
  const sample = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, Math.min(bytes.byteLength, 4096)))
    .replace(/^\uFEFF/u, "")
    .trimStart()
    .toLocaleLowerCase();
  return /^(?:<!doctype\s+html\b|<html\b|<head\b|<body\b)/u.test(sample);
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
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
  return safe || "document";
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

function fileExtension(name: string): string {
  return name.split(".").at(-1)?.toLocaleLowerCase() ?? "";
}

function mediaTypeFor(format: SourceDocumentFormat): string {
  return {
    pdf: "application/pdf",
    epub: "application/epub+zip",
    html: "text/html",
  }[format];
}

function unsupported(name: string): DomainError {
  return new DomainError(
    "unsupported-source-file",
    `${name} is not a recognizable PDF, EPUB, or HTML document.`,
  );
}

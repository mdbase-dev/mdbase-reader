import { DomainError } from "../domain/errors.js";

import type { SourceDocumentFormat } from "./ports.js";

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

export function mediaTypeFor(format: SourceDocumentFormat): string {
  return {
    pdf: "application/pdf",
    epub: "application/epub+zip",
    html: "text/html",
  }[format];
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

function fileExtension(name: string): string {
  return name.split(".").at(-1)?.toLocaleLowerCase() ?? "";
}

function unsupported(name: string): DomainError {
  return new DomainError(
    "unsupported-source-file",
    `${name} is not a recognizable PDF, EPUB, or HTML document.`,
  );
}

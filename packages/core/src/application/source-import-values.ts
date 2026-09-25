import { DomainError } from "../domain/errors.js";

import type { SourceFileImportRequest, SourceImportMetadata } from "./ports.js";

export function webUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DomainError("invalid-source-import", "The source URL is invalid.");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    throw new DomainError("invalid-source-import", "The source URL must be a public web address.");
  }
  return url.href;
}

export function validateCapture(
  capture: NonNullable<SourceFileImportRequest["capture"]>,
): NonNullable<SourceFileImportRequest["capture"]> {
  const submittedUrl = httpsUrl(capture.submittedUrl);
  const canonicalUrl = httpsUrl(capture.canonicalUrl);
  return { submittedUrl, canonicalUrl, retrievedAt: capture.retrievedAt };
}

export function validateMetadata(metadata: SourceImportMetadata): SourceImportMetadata {
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

export function normalizeOptionalText(
  value: string | undefined,
  maximum: number,
): string | undefined {
  const normalized = value?.replace(/\s+/gu, " ").trim().slice(0, maximum);
  return normalized && normalized.length > 0 ? normalized : undefined;
}

export function httpsUrl(value: string): string {
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

export function safeFileName(value: string): string {
  const leaf = value.replaceAll("\\", "/").split("/").at(-1)?.trim() ?? "";
  const clean = Array.from(leaf)
    .filter((character) => character.charCodeAt(0) > 31 && character !== "\u007f")
    .join("");
  if (!clean || clean === "." || clean === "..") {
    throw new DomainError("invalid-source-import", "The selected file needs a valid filename.");
  }
  return clean;
}

export function safeFileStem(name: string): string {
  const stem = name.replace(/\.[^.]+$/u, "");
  const safe = stem
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, "-")
    .replace(/^[._-]+|[._-]+$/gu, "")
    .slice(0, 96);
  return safe.length > 0 ? safe : "document";
}

export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/u, "").replace(/[_-]+/gu, " ");
}

export function normalizeTitle(value: string): string {
  const title = value.trim().replace(/\s+/gu, " ");
  if (!title) {
    throw new DomainError("invalid-source-import", "The source needs a title.");
  }
  return title;
}

import { t } from "@lingui/core/macro";

import { DomainError } from "../domain/errors.js";
import { sourceNotePaths } from "../domain/record-names.js";

import type { SourceFileImportRequest, SourceImportMetadata } from "./ports.js";
import type { SourceId } from "../domain/identity.js";
import type { AuthorYear } from "../domain/record-names.js";

export function webUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DomainError("invalid-source-import", t({ message: "The source URL is invalid." }));
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    throw new DomainError(
      "invalid-source-import",
      t({ message: "The source URL must be a public web address." }),
    );
  }
  return url.href;
}

export function validateCapture(
  capture: NonNullable<SourceFileImportRequest["capture"]>,
): NonNullable<SourceFileImportRequest["capture"]> {
  const submittedUrl = httpsUrl(capture.submittedUrl);
  const canonicalUrl = httpsUrl(capture.canonicalUrl);
  const extractor = normalizeOptionalText(capture.extractor, 100);
  return {
    submittedUrl,
    canonicalUrl,
    retrievedAt: capture.retrievedAt,
    ...(extractor ? { extractor } : {}),
  };
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
    ...(metadata.socialPost ? { socialPost: metadata.socialPost } : {}),
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
      t({ message: "Web capture provenance contains an invalid URL." }),
    );
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new DomainError(
      "invalid-source-import",
      t({ message: "Web capture provenance must use public HTTPS URLs." }),
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
    throw new DomainError(
      "invalid-source-import",
      t({ message: "The selected file needs a valid filename." }),
    );
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

/**
 * Where a new source note goes, from the naming rules in `domain/record-names.ts`: every path to
 * try, in order, and the first of them. The record is created at the first one that is free.
 */
export function sourceRecordPaths(
  title: string,
  id: SourceId,
  authorYear?: AuthorYear,
): {
  readonly recordPath: string;
  readonly recordPathCandidates: readonly string[];
} {
  const recordPathCandidates = sourceNotePaths({ title, id, authorYear });
  return {
    recordPath: recordPathCandidates[0] ?? `sources/${id}.md`,
    recordPathCandidates,
  };
}

/**
 * The first author's family name and the publication year from import metadata, when both are
 * present. An author written `Family, Given` gives the part before the comma; otherwise the last
 * word is taken as the family name.
 */
export function authorYearFromMetadata(
  metadata: SourceImportMetadata | undefined,
): AuthorYear | undefined {
  const author = metadata?.authors?.[0]?.trim();
  const year = /(?<!\d)\d{4}(?!\d)/u.exec(metadata?.published ?? "")?.[0];
  if (!author || !year) {
    return undefined;
  }
  const family = author.includes(",")
    ? author.slice(0, author.indexOf(","))
    : (author.split(/\s+/u).at(-1) ?? author);
  return family.trim() ? { family: family.trim(), year } : undefined;
}

export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/u, "").replace(/[_-]+/gu, " ");
}

export function normalizeTitle(value: string): string {
  const title = value.trim().replace(/\s+/gu, " ");
  if (!title) {
    throw new DomainError("invalid-source-import", t({ message: "The source needs a title." }));
  }
  return title;
}

import {
  identifiersInText,
  normalizedIsbn,
  type IdentifiersInText,
} from "@mdbase-reader/web-capture/source-identifiers";

import type { SourceImportMetadata } from "@mdbase-reader/core";

/**
 * What a document file says about itself before import: a title, friendly metadata and any
 * identifiers that can find its citation. Like ConnectedDocument, this is renderer
 * integration; PDFium and the EPUB reader load only when a file is inspected.
 */
export interface DocumentFileDetails {
  readonly title?: string;
  readonly metadata: SourceImportMetadata;
  readonly identifiers: IdentifiersInText;
}

export async function readDocumentFileDetails(
  file: { readonly name: string; readonly bytes: Uint8Array; readonly mediaType?: string },
  signal?: AbortSignal,
): Promise<DocumentFileDetails> {
  if (isPdf(file.bytes)) {
    const { readPdfDetails } = await import("@mdbase-reader/renderer-pdf/details");
    const details = await readPdfDetails(file.bytes, signal ? { signal } : {});
    const identifiers = {
      ...identifiersInText(
        [details.subject, details.keywords, details.openingText].filter(Boolean).join("\n"),
      ),
      ...arxivFromFileName(file.name),
    };
    const title = usefulPdfTitle(details.title);
    return {
      ...(title ? { title } : {}),
      metadata: details.author ? { authors: splitAuthors(details.author) } : {},
      identifiers,
    };
  }
  if (file.mediaType === "application/epub+zip" || /\.epub$/iu.test(file.name)) {
    const { readEpubDetails } = await import("@mdbase-reader/renderer-epub/details");
    const details = await readEpubDetails(file.bytes);
    const isbn = details.identifiers
      .map((identifier) => normalizedIsbn(identifier.replace(/^(?:urn:)?isbn:/iu, "")))
      .find(Boolean);
    const doi = details.identifiers
      .map((identifier) => identifiersInText(identifier).doi)
      .find(Boolean);
    return {
      ...(details.title ? { title: details.title } : {}),
      metadata: {
        ...(details.authors.length ? { authors: details.authors } : {}),
        ...(details.published ? { published: details.published } : {}),
        ...(details.description ? { description: details.description } : {}),
        ...(details.language ? { language: details.language } : {}),
      },
      identifiers: { ...(isbn ? { isbn } : {}), ...(doi ? { doi } : {}) },
    };
  }
  return { metadata: {}, identifiers: {} };
}

function isPdf(bytes: Uint8Array): boolean {
  return [0x25, 0x50, 0x44, 0x46, 0x2d].every((byte, index) => bytes[index] === byte);
}

/** arXiv downloads are named by their identifier, such as `1706.03762v7.pdf`. */
function arxivFromFileName(name: string): IdentifiersInText {
  const arxiv = /^(\d{4}\.\d{4,5})(?:v\d+)?\.pdf$/iu.exec(name)?.[1];
  return arxiv ? { arxiv } : {};
}

/** Authoring tools often leave a file name or a placeholder in the PDF's title field. */
function usefulPdfTitle(title: string | undefined): string | undefined {
  if (!title || title.length < 4) {
    return undefined;
  }
  return /^(?:untitled|microsoft word\b|document\d*$)|\.(?:docx?|tex|dvi|pdf|indd)$/iu.test(title)
    ? undefined
    : title;
}

function splitAuthors(value: string): string[] {
  return value
    .split(/\s*(?:;|\band\b|&)\s*/u)
    .map((name) => name.trim())
    .filter(Boolean);
}

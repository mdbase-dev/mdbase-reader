import { isEpub, isHtml, isPdf } from "./document-media.js";

import type { Annotation, DocumentDescriptor, SearchDestination } from "@mdbase-reader/core";

/** Stored locators may be old file links, URLs or renderer addresses, not human labels. */
export function humanPassageLabel(value: string | undefined): string | undefined {
  const label = value?.replace(/\s+/gu, " ").trim();
  // Titles may contain colons and slashes ("Introduction: The Problem", "TCP/IP Illustrated");
  // only links, addresses and single-token paths or file names (any "a/b" without spaces) are rejected.
  const address = /^(?:https?|file|blob|data|epubcfi|urn):/iu.test(label ?? "");
  const pathLike =
    !/\s/u.test(label ?? "") && /[\\/]|\.(?:pdf|epub|x?html?)(?:[?#|].*)?$/iu.test(label ?? "");
  if (!label || /\[\[|\]\]/u.test(label) || address || pathLike) {
    return undefined;
  }
  return label;
}

export function annotationLocationLabel(annotation: Annotation): string | undefined {
  const label = humanPassageLabel(annotation.locator?.label);
  if (label && label !== "EPUB location") {
    return label;
  }
  const position = annotation.target?.position;
  if (position?.kind === "epub") {
    const title = position.locator["title"];
    const chapter = humanPassageLabel(typeof title === "string" ? title : undefined);
    if (chapter) {
      return chapter;
    }
  }
  const pageIndex =
    annotation.target?.pdf?.pageIndex ??
    (position?.kind === "pdf" ? position.pageIndex : undefined);
  if (pageIndex !== undefined) {
    return `p. ${String(pageIndex + 1)}`;
  }
  return annotationDocumentLabel(annotation);
}

function annotationDocumentLabel(annotation: Annotation): string | undefined {
  const position = annotation.target?.position;
  if (annotation.target?.html || position?.kind === "html") {
    return "Web page";
  }
  if (
    annotation.locator?.label === "EPUB location" ||
    annotation.target?.epub ||
    position?.kind === "epub"
  ) {
    return "EPUB";
  }
  return documentFormatLabel("", annotation.document?.file ?? "");
}

function documentFormatLabel(mediaType: string, file: string): string | undefined {
  if (isPdf(mediaType, file)) {
    return "PDF";
  }
  if (isEpub(mediaType, file)) {
    return "EPUB";
  }
  return isHtml(mediaType, file) ? "Web page" : undefined;
}

export function documentPassageLabel(
  document: DocumentDescriptor | undefined,
  destination: SearchDestination | undefined,
  file: string | undefined,
): string {
  const path = file ?? document?.file ?? "";
  const mediaType = document?.mediaType ?? "";
  const format = documentFormatLabel(mediaType, path) ?? "Document";
  const title = humanPassageLabel(document?.title) ?? format;
  return destination?.location.kind === "pdf"
    ? `${title} · p. ${String(destination.location.pageIndex + 1)}`
    : title;
}

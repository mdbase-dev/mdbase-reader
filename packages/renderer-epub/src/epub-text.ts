import { locateSearchQuote } from "@mdbase-reader/reading-surface";

import { epubSelectionEvidence } from "./epub-cfi.js";
import { stableEpubHref } from "./epub-locator.js";

import type { SearchDestination, SearchTextSegment } from "@mdbase-reader/core";
import type { Publication } from "@readium/shared";

export async function extractPublicationText(
  publication: Publication,
  signal?: AbortSignal,
): Promise<string> {
  const parts: string[] = [];
  for (const link of publication.readingOrder.items) {
    signal?.throwIfAborted();
    const resource = publication.get(link);
    try {
      const markup = await resource.readAsString();
      signal?.throwIfAborted();
      if (markup) {
        parts.push(readableMarkupText(markup, link.type));
      }
    } finally {
      resource.close();
    }
  }
  return parts.filter(Boolean).join("\n");
}

export async function extractPublicationSearchSegments(
  publication: Publication,
  publicationBaseUrl: string,
  signal?: AbortSignal,
): Promise<readonly SearchTextSegment[]> {
  const segments: SearchTextSegment[] = [];
  for (const link of publication.readingOrder.items) {
    signal?.throwIfAborted();
    const resource = publication.get(link);
    try {
      const markup = await resource.readAsString();
      signal?.throwIfAborted();
      if (markup) {
        segments.push({
          location: { kind: "epub", href: stableEpubHref(link.href, publicationBaseUrl) },
          text: readableMarkupText(markup, link.type),
        });
      }
    } finally {
      resource.close();
    }
  }
  return segments;
}

/** Re-read the spine item and derive a CFI from verified quotation evidence, not guessed offsets. */
export async function resolvePublicationSearchDestination(
  publication: Publication,
  publicationBaseUrl: string,
  destination: SearchDestination,
): Promise<Readonly<Record<string, unknown>> | null> {
  const location = destination.location;
  if (location.kind !== "epub") {
    return null;
  }
  const index = publication.readingOrder.items.findIndex(
    (link) => stableEpubHref(link.href, publicationBaseUrl) === location.href,
  );
  const link = publication.readingOrder.items[index];
  if (!link) {
    return null;
  }
  const resource = publication.get(link);
  try {
    const markup = await resource.readAsString();
    if (!markup) {
      return null;
    }
    const document = new DOMParser().parseFromString(
      markup,
      link.type === "application/xhtml+xml" ? "application/xhtml+xml" : "text/html",
    );
    const range = locateSearchQuote(document.body, destination.quote);
    const evidence = range ? epubSelectionEvidence(range, index) : null;
    return evidence
      ? {
          href: location.href,
          type: link.type ?? "application/xhtml+xml",
          locations: { fragments: [evidence.cfi] },
          text: {
            highlight: destination.quote.exact,
            before: destination.quote.prefix,
            after: destination.quote.suffix,
          },
        }
      : null;
  } finally {
    resource.close();
  }
}

export function readableMarkupText(markup: string, mediaType?: string): string {
  const parser = new DOMParser();
  const document = parser.parseFromString(
    markup,
    mediaType === "application/xhtml+xml" ? "application/xhtml+xml" : "text/html",
  );
  document.querySelectorAll("script, style, noscript, template").forEach((node) => node.remove());
  return document.body.textContent;
}

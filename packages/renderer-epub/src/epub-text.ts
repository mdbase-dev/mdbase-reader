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

export function readableMarkupText(markup: string, mediaType?: string): string {
  const parser = new DOMParser();
  const document = parser.parseFromString(
    markup,
    mediaType === "application/xhtml+xml" ? "application/xhtml+xml" : "text/html",
  );
  document.querySelectorAll("script, style, noscript, template").forEach((node) => node.remove());
  return document.body.textContent;
}

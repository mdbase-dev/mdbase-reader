import { pageClaims, type Claim } from "@mdbase-reader/web-capture/citation-updates";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { DocumentDescriptor, Source } from "@mdbase-reader/core";

export const MAX_CITATION_ARCHIVE_BYTES = 5 * 1024 * 1024;

export function citationArchive(source: Source | null): DocumentDescriptor | undefined {
  return source?.documents.find(
    ({ role, mediaType }) =>
      role === "archive" &&
      ["text/html", "application/xhtml+xml"].includes(
        (mediaType.split(";")[0] ?? "").trim().toLowerCase(),
      ),
  );
}

/** Optional evidence: a missing, oversized or unreadable archive must not break remote lookup. */
export async function archivedCitationClaims(
  gateway: ReaderWorkspaceGateway,
  source: Source | null,
  fallbackUrl: string | undefined,
  signal: AbortSignal,
): Promise<readonly Claim[]> {
  const archive = citationArchive(source);
  if (!source || !archive) {
    return [];
  }
  try {
    signal.throwIfAborted();
    const file = await gateway.readFile(archive.file, archive.revision, {
      signal,
      maxBytes: MAX_CITATION_ARCHIVE_BYTES,
    });
    signal.throwIfAborted();
    if (file.bytes.byteLength > MAX_CITATION_ARCHIVE_BYTES) {
      return [];
    }
    const capture = record(source.frontmatter["capture"]);
    const entries = source.frontmatter["documents"];
    const entry = Array.isArray(entries)
      ? entries.map(record).find((value) => value["file_id"] === archive.fileId)
      : undefined;
    const url = text(entry?.["origin_url"]) ?? text(capture["canonical_url"]) ?? fallbackUrl;
    if (!url || !/^https?:\/\//iu.test(url)) {
      return [];
    }
    const observedAt =
      timestamp(entry?.["retrieved_at"]) ??
      timestamp(capture["captured_at"]) ??
      timestamp(source.frontmatter["saved_at"]) ??
      new Date().toISOString();
    const html = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
    const document = archiveMetadataDocument(html);
    signal.throwIfAborted();
    return pageClaims(document, url, observedAt).claims;
  } catch {
    signal.throwIfAborted();
    // Archived files may have been removed, changed revision, or contain invalid encoding.
    return [];
  }
}

/**
 * Parse untrusted markup in a template first: unlike DOMParser's HTML document, template
 * contents cannot load images/iframes. Pass only citation-bearing markup to DOMParser and
 * never attach either tree to the live document. Keep JSON-LD, but no executable scripts,
 * resource links, event handlers, styles or URL-bearing resource attributes.
 */
function archiveMetadataDocument(html: string): Document {
  const template = document.createElement("template");
  template.innerHTML = html;
  const safe = document.createElement("template");
  const attributes = new Map<string, readonly string[]>([
    ["meta", ["name", "property", "content"]],
    ["link", ["href"]],
    ["script", ["type"]],
    ["title", []],
  ]);
  for (const element of template.content.querySelectorAll(
    'title, meta, link[rel~="canonical"], script[type="application/ld+json"]',
  )) {
    if (element.namespaceURI !== "http://www.w3.org/1999/xhtml") {
      continue;
    }
    const clean = document.createElement(element.localName);
    for (const name of attributes.get(element.localName) ?? []) {
      const value = element.getAttribute(name);
      if (value !== null) {
        clean.setAttribute(name, value);
      }
    }
    if (element.localName === "link") {
      clean.setAttribute("rel", "canonical");
    } else if (element.localName === "script") {
      // JSON escapes preserve values without allowing a serialized closing script tag.
      clean.textContent = element.textContent.replaceAll("<", "\\u003c");
    } else if (element.localName === "title") {
      clean.textContent = element.textContent;
    }
    safe.content.append(clean);
  }
  // Match pageClaims' heading selection without copying the page's resource-bearing body.
  const headings = template.content.querySelectorAll("h1");
  const heading =
    headings.length === 1 ? headings[0] : template.content.querySelector("main h1, article h1");
  if (heading) {
    const clean = document.createElement("h1");
    clean.textContent = heading.textContent;
    safe.content.append(clean);
  }
  return new DOMParser().parseFromString(safe.innerHTML, "text/html");
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function timestamp(value: unknown): string | undefined {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : undefined;
}

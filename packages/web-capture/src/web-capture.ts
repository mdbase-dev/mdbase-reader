import {
  dateTime,
  type SourceCaptureProvenance,
  type SourceImportMetadata,
} from "@mdbase-reader/core";
import { Readability } from "@mozilla/readability";

import { archiveDocument } from "./archive-document.js";
import { citationAuthors } from "./csl-values.js";
import { extractScholarlyMetadata, type ScholarlyMetadata } from "./scholarly-metadata.js";

export const WEB_CAPTURE_EXTRACTOR = "mozilla-readability@0.6.0";

export interface CapturedWebDocument {
  readonly submittedUrl: string;
  readonly canonicalUrl: string;
  readonly retrievedAt: string;
  readonly html: string;
}

export interface WebCaptureImport {
  readonly name: string;
  readonly title: string;
  readonly bytes: Uint8Array;
  readonly archive: { readonly name: string; readonly bytes: Uint8Array };
  readonly capture: SourceCaptureProvenance;
  readonly metadata: SourceImportMetadata;
  readonly scholarly: ScholarlyMetadata;
}

export interface LiveWebCapture extends CapturedWebDocument {
  readonly pageTitle: string;
}

export function captureLiveDocument(document: Document, retrievedAt = new Date()): LiveWebCapture {
  const submittedUrl = safeHttpsUrl(document.location.href);
  const canonicalUrl = canonicalDocumentUrl(document, submittedUrl);
  return {
    submittedUrl,
    canonicalUrl,
    retrievedAt: retrievedAt.toISOString(),
    html: serializeDocument(snapshotDocument(document)),
    pageTitle: normalizedText(document.title, 300) ?? new URL(canonicalUrl).hostname,
  };
}

export async function webCaptureImport(capture: CapturedWebDocument): Promise<WebCaptureImport> {
  const parsed = parseHtml(capture.html);
  const canonicalUrl = new URL(capture.canonicalUrl);
  const archive = archiveDocument(parsed);
  const minimized = parseHtml(archive);
  const article = new Readability(minimized.cloneNode(true) as Document, {
    keepClasses: false,
  }).parse();
  const title = normalizedText(article?.title, 300) ?? captureTitle(parsed, canonicalUrl.hostname);
  const readable = articleDocument(parsed, article?.content ?? minimized.body.innerHTML, title);
  const { prepareHtmlDocument } = await import("@mdbase-reader/renderer-html");
  const stem = safeStem(canonicalUrl.hostname);
  const scholarly = extractScholarlyMetadata(parsed, capture.canonicalUrl);
  const metadata = captureMetadata(parsed, canonicalUrl, article);
  const scholarlyAuthors = scholarly.citation ? citationAuthors(scholarly.citation) : [];
  return {
    name: `${stem}.readable.html`,
    title,
    bytes: new TextEncoder().encode(prepareHtmlDocument(readable)),
    archive: {
      name: `${stem}.archive.html`,
      bytes: new TextEncoder().encode(archive),
    },
    capture: {
      submittedUrl: capture.submittedUrl,
      canonicalUrl: capture.canonicalUrl,
      retrievedAt: dateTime(capture.retrievedAt),
    },
    // Publisher tags list every author; Readability's byline is often a single display string.
    metadata: scholarlyAuthors.length ? { ...metadata, authors: scholarlyAuthors } : metadata,
    scholarly,
  };
}

function snapshotDocument(document: Document): Document {
  const clone = document.cloneNode(true) as Document;
  for (const control of clone.querySelectorAll("input, textarea, select, option")) {
    control.remove();
  }
  for (const element of clone.querySelectorAll("[contenteditable]")) {
    element.removeAttribute("contenteditable");
  }
  return clone;
}

function serializeDocument(document: Document): string {
  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function articleDocument(source: Document, content: string, title: string): string {
  const language = normalizedText(source.documentElement.lang, 100);
  return `<!doctype html><html${language ? ` lang="${escapeAttribute(language)}"` : ""}><head><meta charset="utf-8"><title>${escapeText(title)}</title></head><body><main><article>${content}</article></main></body></html>`;
}

function captureMetadata(
  document: Document,
  canonicalUrl: URL,
  article: ReturnType<Readability["parse"]>,
): SourceImportMetadata {
  const authors = captureAuthors(document, article);
  const published = capturePublished(document, article);
  const description = captureDescription(document, article);
  const language = firstText([article?.lang, document.documentElement.lang], 100);
  const site = firstText(
    [
      article?.siteName,
      document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content,
      canonicalUrl.hostname,
    ],
    300,
  );
  return {
    ...(authors.length ? { authors } : {}),
    ...(published ? { published } : {}),
    ...(description ? { description } : {}),
    ...(language ? { language } : {}),
    ...(site ? { site } : {}),
  };
}

function captureAuthors(document: Document, article: ReturnType<Readability["parse"]>): string[] {
  const metaAuthors = [
    ...document.querySelectorAll<HTMLMetaElement>(
      'meta[name="author"], meta[property="article:author"]',
    ),
  ]
    .map(({ content }) => normalizedText(content, 300))
    .filter((value): value is string => value !== undefined);
  const byline = normalizedText(article?.byline, 300);
  return [...new Set([...(byline ? [byline] : []), ...metaAuthors])];
}

function capturePublished(
  document: Document,
  article: ReturnType<Readability["parse"]>,
): string | undefined {
  return firstText(
    [
      article?.publishedTime,
      document.querySelector<HTMLMetaElement>('meta[property="article:published_time"]')?.content,
      document.querySelector<HTMLMetaElement>('meta[name="date"]')?.content,
      document.querySelector<HTMLTimeElement>("time[datetime]")?.dateTime,
    ],
    100,
  );
}

function captureDescription(
  document: Document,
  article: ReturnType<Readability["parse"]>,
): string | undefined {
  return firstText(
    [
      document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content,
      document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content,
      article?.excerpt,
    ],
    2_000,
  );
}

function canonicalDocumentUrl(document: Document, fallback: string): string {
  const value = document.querySelector<HTMLLinkElement>('link[rel~="canonical"]')?.href;
  try {
    return value ? safeHttpsUrl(value) : fallback;
  } catch {
    return fallback;
  }
}

function safeHttpsUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Reader can capture ordinary HTTPS pages only.");
  }
  url.hash = "";
  return url.href;
}

function captureTitle(document: Document, fallback: string): string {
  return (
    firstText(
      [
        document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content,
        document.title,
        document.querySelector("h1")?.textContent,
      ],
      300,
    ) ?? fallback
  );
}

function firstText(
  values: readonly (string | null | undefined)[],
  maximum: number,
): string | undefined {
  return values.map((value) => normalizedText(value, maximum)).find(Boolean);
}

function normalizedText(value: string | null | undefined, maximum: number): string | undefined {
  const normalized = value?.replace(/\s+/gu, " ").trim().slice(0, maximum);
  return normalized?.length ? normalized : undefined;
}

function safeStem(hostname: string): string {
  const stem = hostname
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}.-]+/gu, "-")
    .replace(/^[.-]+|[.-]+$/gu, "")
    .slice(0, 96);
  return stem.length ? stem : "captured-page";
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;");
}

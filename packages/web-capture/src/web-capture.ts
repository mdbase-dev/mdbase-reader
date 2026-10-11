import {
  dateTime,
  type SourceCaptureProvenance,
  type SourceImportMetadata,
  type SocialPost,
} from "@mdbase-reader/core";

import { citationAuthors } from "./csl-values.js";
import { extractScholarlyMetadata, type ScholarlyMetadata } from "./scholarly-metadata.js";
import { socialPostImport } from "./social/import.js";
import { adapterFor, postAddress } from "./social/index.js";

export const WEB_CAPTURE_EXTRACTOR = "defuddle@0.19.5";
const fallbackExtractor = "mozilla-readability@0.6.0";

interface ExtractedArticle {
  readonly content: string;
  readonly title?: string | null;
  readonly author?: string | null;
  readonly published?: string | null;
  readonly description?: string | null;
  readonly language?: string | null;
  readonly site?: string | null;
}

export interface CapturedWebDocument {
  readonly submittedUrl: string;
  readonly canonicalUrl: string;
  readonly retrievedAt: string;
  readonly html: string;
  readonly post?: SocialPost;
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

export interface WebCaptureImportOptions {
  /** `capture.html` already parsed, such as for an earlier citation lookup. It is not modified. */
  readonly document?: Document;
}

export async function webCaptureImport(
  capture: CapturedWebDocument,
  options: WebCaptureImportOptions = {},
): Promise<WebCaptureImport> {
  if (capture.post) {
    return socialPostImport(capture.post, capture);
  }
  const socialDocument = options.document ?? parseHtml(capture.html);
  const adapter = adapterFor(socialDocument, capture.submittedUrl);
  if (adapter) {
    if (adapter.detect(socialDocument, capture.submittedUrl) !== "single") {
      throw new Error(
        "Feeds cannot be saved as sources. Choose individual posts in the Reader extension.",
      );
    }
    const address = postAddress(capture.submittedUrl);
    if (!address) {
      throw new Error("Open a post permalink to save it.");
    }
    const ref = adapter.items(socialDocument).find((item) => item.id === address.id) ?? {
      ...address,
      author: "",
      snippet: "",
      top: 0,
      bottom: 0,
    };
    return socialPostImport(await adapter.extract(ref, socialDocument), capture);
  }
  const parsed = options.document ?? parseHtml(capture.html);
  const canonicalUrl = new URL(capture.canonicalUrl);
  // Loaded on save only: opening the capture panel should not pay for extraction.
  const [{ article, extractor }, { prepareHtmlDocument }] = await Promise.all([
    extractArticle(parsed, capture.canonicalUrl),
    import("@mdbase-reader/renderer-html"),
  ]);
  const title = normalizedText(article.title, 300) ?? captureTitle(parsed, canonicalUrl.hostname);
  const readable = articleDocument(
    parsed,
    article.content || parsed.body.innerHTML,
    title,
    article.language,
  );
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
      bytes: new TextEncoder().encode(capture.html),
    },
    capture: {
      submittedUrl: capture.submittedUrl,
      canonicalUrl: capture.canonicalUrl,
      retrievedAt: dateTime(capture.retrievedAt),
      extractor,
    },
    // Publisher tags list every author; an extractor's byline is often a single display string.
    metadata: scholarlyAuthors.length ? { ...metadata, authors: scholarlyAuthors } : metadata,
    scholarly,
  };
}

async function extractArticle(
  parsed: Document,
  url: string,
): Promise<{ readonly article: ExtractedArticle; readonly extractor: string }> {
  const { default: Defuddle } = await import("defuddle");
  const article: ExtractedArticle = new Defuddle(parsed.cloneNode(true) as Document, {
    url,
    useAsync: false,
    fetch: extractionFetch,
    // Prefer intact evidence over aggressive cleanup: rewriting structures, partial selectors,
    // short-content patterns and hidden sidenotes all lost real text in the comparison corpus.
    standardize: false,
    removeContentPatterns: false,
    removePartialSelectors: false,
    removeHiddenElements: false,
    removeSmallImages: false,
  }).parse();
  const extractedWords = wordCount(article.content);
  if (suspiciouslyShort(parsed, extractedWords)) {
    const { Readability } = await import("@mozilla/readability");
    const fallback = new Readability(parsed.cloneNode(true) as Document, {
      keepClasses: false,
    }).parse();
    // A large body can just be navigation. Switch only for substantially more readable text.
    if (
      fallback &&
      wordCount(fallback.content ?? "") > Math.max(extractedWords * 1.5, extractedWords + 200)
    ) {
      return {
        article: {
          content: fallback.content ?? "",
          title: fallback.title ?? null,
          author: fallback.byline ?? null,
          published: fallback.publishedTime ?? null,
          description: fallback.excerpt ?? null,
          language: fallback.lang ?? null,
          site: fallback.siteName ?? null,
        },
        extractor: fallbackExtractor,
      };
    }
  }
  return { article, extractor: WEB_CAPTURE_EXTRACTOR };
}

function extractionFetch(): never {
  throw new Error("Web capture extraction must not access the network.");
}

function wordCount(content: string): number {
  const template = document.createElement("template");
  template.innerHTML = content;
  for (const element of template.content.querySelectorAll(
    "script, style, noscript, template, nav, header, footer, [hidden]",
  )) {
    element.remove();
  }
  return template.content.textContent.trim().split(/\s+/u).filter(Boolean).length;
}

function suspiciouslyShort(document: Document, extractedWords: number): boolean {
  const pageWords = wordCount(document.body.innerHTML);
  return pageWords >= 400 && extractedWords < pageWords * 0.5;
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

function articleDocument(
  source: Document,
  content: string,
  title: string,
  extractedLanguage?: string | null,
): string {
  const language = firstText([source.documentElement.lang, extractedLanguage], 100);
  return `<!doctype html><html${language ? ` lang="${escapeAttribute(language)}"` : ""}><head><meta charset="utf-8"><title>${escapeText(title)}</title></head><body><main><article>${content}</article></main></body></html>`;
}

function captureMetadata(
  document: Document,
  canonicalUrl: URL,
  article: ExtractedArticle,
): SourceImportMetadata {
  const authors = captureAuthors(document, article);
  const published = capturePublished(document, article);
  const description = captureDescription(document, article);
  const language = firstText([article.language, document.documentElement.lang], 100);
  const site = firstText(
    [
      article.site,
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

function captureAuthors(document: Document, article: ExtractedArticle): string[] {
  const metaAuthors = [
    ...document.querySelectorAll<HTMLMetaElement>(
      'meta[name="author"], meta[property="article:author"]',
    ),
  ]
    .map(({ content }) => normalizedText(content, 300))
    .filter((value): value is string => value !== undefined);
  const byline = normalizedText(article.author, 300);
  return [...new Set([...(byline ? [byline] : []), ...metaAuthors])];
}

function capturePublished(document: Document, article: ExtractedArticle): string | undefined {
  return firstText(
    [
      article.published,
      document.querySelector<HTMLMetaElement>('meta[property="article:published_time"]')?.content,
      document.querySelector<HTMLMetaElement>('meta[name="date"]')?.content,
      document.querySelector<HTMLTimeElement>("time[datetime]")?.dateTime,
    ],
    100,
  );
}

function captureDescription(document: Document, article: ExtractedArticle): string | undefined {
  return firstText(
    [
      article.description,
      document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content,
      document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content,
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

import {
  dateTime,
  type SourceCaptureProvenance,
  type SourceImportMetadata,
} from "@mdbase-reader/core";

interface CaptureResponseDocument {
  readonly submittedUrl: string;
  readonly canonicalUrl: string;
  readonly retrievedAt: string;
  readonly html: string;
}

export interface WebCaptureImport {
  readonly name: string;
  readonly title: string;
  readonly bytes: Uint8Array;
  readonly archive: {
    readonly name: string;
    readonly bytes: Uint8Array;
  };
  readonly capture: SourceCaptureProvenance;
  readonly metadata: SourceImportMetadata;
}

export async function fetchWebCapture(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<WebCaptureImport> {
  const response = await fetcher("/api/capture", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "x-mdbase-reader-capture": "1",
    },
    body: JSON.stringify({ url }),
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(captureProblem(value) ?? "Reader could not capture that page.");
  }
  return webCaptureImport(parseCaptureResponse(value));
}

export async function webCaptureImport(
  capture: CaptureResponseDocument,
): Promise<WebCaptureImport> {
  const parsed = new DOMParser().parseFromString(capture.html, "text/html");
  const canonicalUrl = new URL(capture.canonicalUrl);
  const title = captureTitle(parsed, canonicalUrl.hostname);
  const { prepareHtmlDocument } = await import("@mdbase-reader/renderer-html");
  const prepared = prepareHtmlDocument(capture.html);
  const stem = safeStem(canonicalUrl.hostname);
  return {
    name: `${stem}.readable.html`,
    title,
    bytes: new TextEncoder().encode(prepared),
    archive: {
      name: `${stem}.archive.html`,
      bytes: new TextEncoder().encode(capture.html),
    },
    capture: {
      submittedUrl: capture.submittedUrl,
      canonicalUrl: capture.canonicalUrl,
      retrievedAt: dateTime(capture.retrievedAt),
    },
    metadata: captureMetadata(parsed, canonicalUrl),
  };
}

function captureMetadata(document: Document, canonicalUrl: URL): SourceImportMetadata {
  const authorValues = [
    ...document.querySelectorAll<HTMLMetaElement>(
      'meta[name="author"], meta[property="article:author"]',
    ),
  ]
    .map(({ content }) => normalizeTitle(content))
    .filter((value): value is string => value !== null);
  const published = firstNormalized([
    document.querySelector<HTMLMetaElement>('meta[property="article:published_time"]')?.content,
    document.querySelector<HTMLMetaElement>('meta[name="date"]')?.content,
    document.querySelector<HTMLTimeElement>("time[datetime]")?.dateTime,
  ]);
  const description = firstNormalized([
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content,
    document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content,
  ]);
  const language = normalizeTitle(document.documentElement.lang);
  const site =
    normalizeTitle(
      document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content,
    ) ?? canonicalUrl.hostname;
  return {
    ...(authorValues.length ? { authors: [...new Set(authorValues)] } : {}),
    ...(published ? { published } : {}),
    ...(description ? { description } : {}),
    ...(language ? { language } : {}),
    ...(site ? { site } : {}),
  };
}

function firstNormalized(values: readonly (string | null | undefined)[]): string | undefined {
  return values.map((value) => normalizeTitle(value)).find((value) => value !== null) ?? undefined;
}

function parseCaptureResponse(value: unknown): CaptureResponseDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Reader received an invalid capture response.");
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  const submittedUrl = candidate["submittedUrl"];
  const canonicalUrl = candidate["canonicalUrl"];
  const retrievedAt = candidate["retrievedAt"];
  const html = candidate["html"];
  if (
    typeof submittedUrl !== "string" ||
    typeof canonicalUrl !== "string" ||
    typeof retrievedAt !== "string" ||
    typeof html !== "string"
  ) {
    throw new Error("Reader received an incomplete capture response.");
  }
  return { submittedUrl, canonicalUrl, retrievedAt, html };
}

function captureProblem(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const message = (value as { readonly message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : null;
}

function captureTitle(document: Document, fallback: string): string {
  const socialTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content;
  const heading = document.querySelector("h1")?.textContent;
  return (
    normalizeTitle(socialTitle) ??
    normalizeTitle(document.title) ??
    normalizeTitle(heading) ??
    fallback
  );
}

function normalizeTitle(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/gu, " ").trim().slice(0, 300) ?? "";
  return normalized || null;
}

function safeStem(hostname: string): string {
  return (
    hostname
      .normalize("NFKC")
      .replace(/[^\p{Letter}\p{Number}.-]+/gu, "-")
      .replace(/^[.-]+|[.-]+$/gu, "")
      .slice(0, 96) || "captured-page"
  );
}

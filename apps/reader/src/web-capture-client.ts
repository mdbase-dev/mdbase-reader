import {
  webCaptureImport,
  type CapturedWebDocument as CaptureResponseDocument,
  type WebCaptureImport,
} from "@mdbase-reader/web-capture";

export type { WebCaptureImport } from "@mdbase-reader/web-capture";
export { webCaptureImport } from "@mdbase-reader/web-capture";

export async function fetchWebCapture(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<WebCaptureImport> {
  const captured = await fetchCapture(url, { fetch: fetcher });
  if (captured.kind !== "html") {
    throw new Error("Reader expected a web page.");
  }
  return captured.page;
}

export interface CapturedPdfFile {
  readonly kind: "pdf";
  readonly bytes: Uint8Array;
  readonly submittedUrl: string;
  readonly canonicalUrl: string;
  readonly retrievedAt: string;
}

export type CaptureResult =
  { readonly kind: "html"; readonly page: WebCaptureImport } | CapturedPdfFile;

/** Fetches an address through Reader's capture service, which guards against private hosts. */
export async function fetchCapture(
  url: string,
  options: {
    readonly allowPdf?: boolean;
    readonly signal?: AbortSignal;
    readonly fetch?: typeof fetch;
  } = {},
): Promise<CaptureResult> {
  const fetcher = options.fetch ?? fetch;
  const response = await fetcher("/api/capture", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "x-mdbase-reader-capture": "1",
    },
    body: JSON.stringify({ url, ...(options.allowPdf ? { allowPdf: true } : {}) }),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (response.ok && response.headers.get("content-type")?.startsWith("application/pdf")) {
    return {
      kind: "pdf",
      bytes: new Uint8Array(await response.arrayBuffer()),
      submittedUrl: decodeURI(response.headers.get("x-mdbase-submitted-url") ?? url),
      canonicalUrl: decodeURI(response.headers.get("x-mdbase-canonical-url") ?? url),
      retrievedAt: response.headers.get("x-mdbase-retrieved-at") ?? new Date().toISOString(),
    };
  }
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(captureProblem(value) ?? "Reader could not capture that page.");
  }
  return { kind: "html", page: await webCaptureImport(parseCaptureResponse(value)) };
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

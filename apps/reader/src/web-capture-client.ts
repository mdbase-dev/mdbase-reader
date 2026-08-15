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

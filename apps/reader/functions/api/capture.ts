import {
  capturePage,
  resolvePublicAddresses,
  type CapturePageDependencies,
} from "../../capture/capture-page.js";
import { CapturePolicyError } from "../../capture/public-url.js";

interface PagesFunctionContext {
  readonly request: Request;
}

export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  if (context.request.method !== "POST") {
    return json({ code: "method_not_allowed", message: "Use POST to capture a page." }, 405);
  }
  try {
    assertSameOriginBrowserRequest(context.request);
    const submittedUrl = await requestUrl(context.request);
    const dependencies: CapturePageDependencies = {
      fetch: (input, init) => fetch(input, init),
      resolveAddresses: (hostname) =>
        resolvePublicAddresses(hostname, (input, init) => fetch(input, init)),
      now: () => new Date(),
    };
    return json(await capturePage(submittedUrl, dependencies), 200);
  } catch (reason) {
    if (reason instanceof CapturePolicyError) {
      return json({ code: reason.code, message: reason.message }, reason.status);
    }
    return json(
      { code: "capture_failed", message: captureFailureMessage(reason, context.request) },
      502,
    );
  }
}

function captureFailureMessage(reason: unknown, request: Request): string {
  const hostname = new URL(request.url).hostname;
  return (hostname === "127.0.0.1" || hostname === "localhost") && reason instanceof Error
    ? `Reader could not retrieve that page: ${reason.message}`
    : "Reader could not retrieve that page.";
}

function assertSameOriginBrowserRequest(request: Request): void {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin !== expected || (fetchSite !== null && fetchSite !== "same-origin")) {
    throw new CapturePolicyError(
      "capture_origin_denied",
      "Web capture is available inside Reader only.",
      403,
    );
  }
  if (request.headers.get("x-mdbase-reader-capture") !== "1") {
    throw new CapturePolicyError(
      "capture_request_denied",
      "Reader could not verify this capture request.",
      403,
    );
  }
}

async function requestUrl(request: Request): Promise<string> {
  if (!request.headers.get("content-type")?.toLocaleLowerCase().startsWith("application/json")) {
    throw new CapturePolicyError("invalid_request", "Reader expected a JSON capture request.");
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 4096) {
    throw new CapturePolicyError("invalid_request", "The capture request is too large.", 413);
  }
  const body: unknown = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CapturePolicyError("invalid_request", "The capture request is invalid.");
  }
  const url = (body as { readonly url?: unknown }).url;
  if (typeof url !== "string") {
    throw new CapturePolicyError("invalid_request", "Enter a web address to capture.");
  }
  return url.trim();
}

function json(value: unknown, status: number): Response {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
    },
  });
}

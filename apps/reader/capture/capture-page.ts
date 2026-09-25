import { boundedPdfStream, mayBePdf } from "./capture-pdf.js";
import { CapturePolicyError, publicCaptureUrl, type AddressResolver } from "./public-url.js";

const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 12_000;

export interface CapturedPage {
  readonly submittedUrl: string;
  readonly canonicalUrl: string;
  readonly retrievedAt: string;
  readonly html: string;
}

/** A PDF found at the address, streamed rather than buffered. */
export interface CapturedPdf {
  readonly submittedUrl: string;
  readonly canonicalUrl: string;
  readonly retrievedAt: string;
  readonly pdf: ReadableStream<Uint8Array>;
}

export interface CaptureOptions {
  /** Accept a PDF as well as an HTML page. */
  readonly allowPdf?: boolean;
}

export interface CapturePageDependencies {
  readonly fetch: typeof fetch;
  readonly resolveAddresses: AddressResolver;
  readonly now: () => Date;
}

export async function capturePage(
  submittedUrl: string,
  dependencies: CapturePageDependencies,
  options?: { readonly allowPdf?: false },
): Promise<CapturedPage>;
export async function capturePage(
  submittedUrl: string,
  dependencies: CapturePageDependencies,
  options: CaptureOptions,
): Promise<CapturedPage | CapturedPdf>;
export async function capturePage(
  submittedUrl: string,
  dependencies: CapturePageDependencies,
  options: CaptureOptions = {},
): Promise<CapturedPage | CapturedPdf> {
  const submitted = await publicCaptureUrl(submittedUrl, dependencies.resolveAddresses);
  let current = submitted;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetchCapture(current, dependencies.fetch, options);
    if (redirectResponse(response)) {
      if (redirects === MAX_REDIRECTS) {
        throw new CapturePolicyError("redirect_limit", "That page redirected too many times.", 422);
      }
      const location = response.headers.get("location");
      if (!location) {
        throw new CapturePolicyError(
          "invalid_redirect",
          "That page returned an invalid redirect.",
          422,
        );
      }
      current = await publicCaptureUrl(
        new URL(location, current).href,
        dependencies.resolveAddresses,
      );
      continue;
    }
    if (!response.ok) {
      throw new CapturePolicyError(
        "upstream_status",
        `The page returned HTTP ${String(response.status)}.`,
        422,
      );
    }
    const provenance = {
      submittedUrl: submitted.href,
      canonicalUrl: current.href,
      retrievedAt: dependencies.now().toISOString(),
    };
    if (options.allowPdf && mayBePdf(responseMediaType(response))) {
      return { ...provenance, pdf: await boundedPdfStream(response) };
    }
    assertHtmlResponse(response);
    return { ...provenance, html: await boundedResponseText(response) };
  }
  throw new CapturePolicyError("redirect_limit", "That page redirected too many times.", 422);
}

export async function resolvePublicAddresses(
  hostname: string,
  fetcher: typeof fetch,
): Promise<readonly string[]> {
  const answers = await Promise.all(
    ["A", "AAAA"].map(async (type) => {
      const url = new URL("https://cloudflare-dns.com/dns-query");
      url.searchParams.set("name", hostname);
      url.searchParams.set("type", type);
      const response = await fetcher(url, {
        headers: { accept: "application/dns-json" },
        redirect: "manual",
      });
      if (!response.ok) {
        throw new CapturePolicyError("dns_failure", "Reader could not verify that address.", 502);
      }
      return dnsAddresses(await response.json());
    }),
  );
  return [...new Set(answers.flat())];
}

function fetchCapture(url: URL, fetcher: typeof fetch, options: CaptureOptions): Promise<Response> {
  return fetcher(url, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      accept: options.allowPdf
        ? "text/html,application/xhtml+xml;q=0.9,application/pdf;q=0.8"
        : "text/html,application/xhtml+xml;q=0.9",
      "accept-language": "en;q=0.8,*;q=0.5",
    },
  });
}

function redirectResponse(response: Response): boolean {
  return response.status >= 300 && response.status < 400;
}

function responseMediaType(response: Response): string | undefined {
  return response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLocaleLowerCase();
}

function assertHtmlResponse(response: Response): void {
  const mediaType = responseMediaType(response);
  if (mediaType !== "text/html" && mediaType !== "application/xhtml+xml") {
    throw new CapturePolicyError(
      "unsupported_content_type",
      "That address did not return an HTML page.",
      415,
    );
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CAPTURE_BYTES) {
    throw captureTooLarge();
  }
}

async function boundedResponseText(response: Response): Promise<string> {
  if (!response.body) {
    throw new CapturePolicyError("empty_response", "That page returned no content.", 422);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let result = await reader.read();
  while (!result.done) {
    const { value } = result;
    length += value.byteLength;
    if (length > MAX_CAPTURE_BYTES) {
      await reader.cancel();
      throw captureTooLarge();
    }
    chunks.push(value);
    result = await reader.read();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function dnsAddresses(value: unknown): readonly string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const answer = (value as { readonly Answer?: unknown }).Answer;
  return Array.isArray(answer)
    ? answer.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return [];
        }
        const data = (item as { readonly data?: unknown }).data;
        return typeof data === "string" && (data.includes(":") || /^\d+(?:\.\d+){3}$/u.test(data))
          ? [data]
          : [];
      })
    : [];
}

function captureTooLarge(): CapturePolicyError {
  return new CapturePolicyError(
    "capture_too_large",
    "That page is larger than Reader's 2 MB capture limit.",
    413,
  );
}

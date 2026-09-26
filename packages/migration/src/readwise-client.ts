import { array, object, type Fields, type Progress } from "./model.js";
import { scalar } from "./readwise-values.js";
export interface ReadwisePage {
  count: number;
  next: string | null;
  results: Fields[];
}
export class ReadwiseClient {
  private nextRequestAt = 0;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private token: string,
    private fetcher: typeof fetch = fetch,
    private intervalMs = 3100,
  ) {}
  forget(): void {
    this.token = "";
  }
  async request(
    path: string,
    params: Record<string, string>,
    signal: AbortSignal,
  ): Promise<Fields> {
    const run = async (): Promise<Fields> => {
      for (let attempt = 0; attempt < 6; attempt++) {
        signal.throwIfAborted();
        await delay(Math.max(0, this.nextRequestAt - Date.now()), signal);
        if (!this.token) {
          throw new Error("Readwise token has been cleared. Reconnect to continue.");
        }
        this.nextRequestAt = Date.now() + this.intervalMs;
        const url = new URL(path, "https://readwise.io");
        if (url.origin !== "https://readwise.io" || !url.pathname.startsWith("/api/")) {
          throw new Error("Invalid Readwise API path.");
        }
        url.search = new URLSearchParams(params).toString();
        let response: Response;
        const send = this.fetcher;
        try {
          response = await send(url, {
            headers: { Authorization: `Token ${this.token}` },
            signal,
            credentials: "omit",
            redirect: "error",
            referrerPolicy: "no-referrer",
          });
        } catch {
          signal.throwIfAborted();
          throw new Error(
            "Readwise request failed. Check your connection or browser access; your token was not saved.",
          );
        }
        // GETs are safe to repeat; gateways time out on large export pages.
        if ([429, 502, 503, 504].includes(response.status)) {
          const wait = retryDelay(response.headers.get("Retry-After"), attempt);
          this.nextRequestAt = Math.max(this.nextRequestAt, Date.now() + wait);
          continue;
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error("Readwise rejected this token or account access.");
        }
        if (!response.ok) {
          throw new Error(
            `Readwise returned HTTP ${String(response.status)}. No changes were made to Readwise.`,
          );
        }
        try {
          return object(await response.json());
        } catch {
          signal.throwIfAborted();
          throw new Error("Readwise returned an unreadable response. Scan again later.");
        }
      }
      throw new Error("Readwise is rate-limiting requests. Stop and try again later.");
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }
  async page(params: Record<string, string>, signal: AbortSignal): Promise<ReadwisePage> {
    const data = await this.request("/api/v3/list/", { limit: "100", ...params }, signal);
    return {
      count: typeof data["count"] === "number" ? data["count"] : 0,
      next: scalar(data["nextPageCursor"]) || null,
      results: array(data["results"]).map((r) => object(r)),
    };
  }
  async all(
    path: string,
    params: Record<string, string>,
    signal: AbortSignal,
    progress: Progress,
  ): Promise<Fields[]> {
    const result: Fields[] = [];
    let cursor = "";
    const seen = new Set<string>();
    do {
      if (seen.has(cursor)) {
        throw new Error("Readwise returned a repeated pagination cursor.");
      }
      seen.add(cursor);
      const data = await this.request(
        path,
        { ...params, ...(cursor ? { pageCursor: cursor } : {}) },
        signal,
      );
      result.push(...array(data["results"]).map((r) => object(r)));
      progress(`Scanned ${result.length.toLocaleString()} Readwise records…`);
      // Documented as a string, null on the last page; accept a numeric cursor too.
      cursor = scalar(data["nextPageCursor"]);
    } while (cursor);
    return result;
  }
}
function retryDelay(retry: string | null, attempt: number): number {
  const seconds = retry && /^\d+$/u.test(retry) ? Number(retry) : 0;
  return (
    seconds * 1000 || Math.max(0, Date.parse(retry ?? "") - Date.now()) || 5000 * (attempt + 1)
  );
}
export function delay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new Error("Cancelled"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function downloadReadwiseFile(
  url: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<Blob> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname.endsWith(".amazonaws.com") ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("Readwise returned an unexpected file host; download was refused.");
  }
  let response: Response;
  try {
    response = await fetcher(parsed, {
      signal,
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
  } catch {
    signal.throwIfAborted();
    throw new Error(
      "Source file download failed. The host may not support browser access; use Readwise’s full-file export as a fallback.",
    );
  }
  if (!response.ok) {
    throw new Error(
      `Source file download returned HTTP ${String(response.status)}. Retry to obtain a fresh download link.`,
    );
  }
  return response.blob();
}

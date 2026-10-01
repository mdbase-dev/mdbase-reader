import { describe, expect, it, vi } from "vitest";

import { DOI_RESOLUTION_TIMEOUT_MS, resolveDoiCitation } from "./doi.js";
import { citationForPage, PAGE_DOI_TIMEOUT_MS } from "./page-citation.js";

import type { ScholarlyMetadata } from "./scholarly-metadata.js";

const embedded: ScholarlyMetadata = {
  doi: "10.1234/example",
  citation: { type: "article-journal", title: "Embedded title" },
};

/** Like a real fetch, rejects once its signal aborts. */
function hangingFetch(): typeof fetch {
  return vi.fn(
    (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason as Error));
      }),
  );
}

describe("page citations", () => {
  it("falls back to the page's embedded tags when doi.org does not answer in time", async () => {
    const fetch = hangingFetch();
    const preview = await citationForPage(embedded, "https://example.com/article", {
      fetch,
      timeoutMs: 20,
    });
    expect(preview).toMatchObject({
      origin: "page",
      doi: "10.1234/example",
      citation: { title: "Embedded title" },
    });
    expect(preview?.problem).toContain("did not answer");
  });

  it("gives up on a fetch that ignores its abort signal", async () => {
    const fetch = vi.fn(() => new Promise<Response>(() => undefined));
    const preview = await citationForPage(embedded, "https://example.com/article", {
      fetch: fetch as unknown as typeof globalThis.fetch,
      timeoutMs: 20,
    });
    expect(preview?.origin).toBe("page");
  });

  it("bounds the page lookup by a short default so saves never wait long on doi.org", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      await citationForPage(embedded, "https://example.com/article", {
        fetch: (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch,
      });
      expect(PAGE_DOI_TIMEOUT_MS).toBeLessThanOrEqual(3_000);
      expect(timeout).toHaveBeenCalledWith(PAGE_DOI_TIMEOUT_MS);
    } finally {
      timeout.mockRestore();
    }
  });

  it("still stops when the caller aborts, rather than reporting a fallback", async () => {
    const controller = new AbortController();
    const settled = citationForPage(embedded, "https://example.com/article", {
      fetch: hangingFetch(),
      signal: controller.signal,
    });
    controller.abort(new Error("Panel closed"));
    await expect(settled).rejects.toThrow("Panel closed");
  });

  it("uses the registry's record when it answers in time", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ type: "journal-article", title: "Registry title" }), {
          status: 200,
        }),
      ),
    );
    const preview = await citationForPage(embedded, "https://example.com/article", {
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    expect(preview).toMatchObject({ origin: "doi", citation: { title: "Registry title" } });
  });

  it("gives explicit lookups longer than page saves, and says when the registry timed out", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      await expect(
        resolveDoiCitation("10.1234/example", {
          fetch: (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch,
        }),
      ).rejects.toThrow("offline");
      expect(timeout).toHaveBeenCalledWith(DOI_RESOLUTION_TIMEOUT_MS);
      expect(DOI_RESOLUTION_TIMEOUT_MS).toBeGreaterThan(PAGE_DOI_TIMEOUT_MS);
    } finally {
      timeout.mockRestore();
    }
    await expect(
      resolveDoiCitation("10.1234/example", { fetch: hangingFetch(), timeoutMs: 10 }),
    ).rejects.toThrow("within 0.01 seconds");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { DOI_RESOLUTION_TIMEOUT_MS, resolveDoiCitation } from "./doi.js";
import { citationForPage, PAGE_DOI_TIMEOUT_MS } from "./page-citation.js";
import { createProviderQueue } from "./provider-queue.js";

import type { ClaimBatch } from "./claims.js";
import type { CitationPreview } from "./page-citation.js";

const observedAt = "2026-10-21T00:00:00Z";
const pageUrl = "https://example.com/article";
const page: ClaimBatch = {
  claims: Object.entries({
    type: "article-journal",
    title: "Embedded title",
    abstract: "A page-only summary.",
  }).map(([field, value]) => ({
    field,
    value,
    source: { kind: "page", signal: "highwire" },
    evidence: `citation_${field}`,
    observedAt,
  })),
};
const embedded: ClaimBatch = { ...page, identifiers: { doi: "10.1234/example" } };

/** Like a real fetch, rejects once its signal aborts. */
function hangingFetch(): typeof fetch {
  return vi.fn(
    (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason as Error));
      }),
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("page citations", () => {
  it("falls back to page claims when doi.org does not answer in time", async () => {
    vi.useFakeTimers();
    const settled = citationForPage(embedded, pageUrl, { fetch: hangingFetch(), timeoutMs: 20 });
    await vi.advanceTimersByTimeAsync(20);
    const preview = await settled;
    expect(preview).toMatchObject({
      origin: "page",
      doi: "10.1234/example",
      citation: { title: "Embedded title" },
      provenance: { title: { value: "Embedded title", source: "page:highwire" } },
      outcomes: [{ provider: "doi.org", result: "timeout" }],
    });
    expect(preview?.problem).toContain("did not answer");
  });

  it("gives up on a fetch that ignores its abort signal", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => undefined));
    const settled = citationForPage(embedded, pageUrl, { fetch, timeoutMs: 20 });
    await vi.advanceTimersByTimeAsync(20);
    expect((await settled)?.origin).toBe("page");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds the page lookup by a short default so saves never wait long on doi.org", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => undefined));
    const settled = citationForPage(embedded, pageUrl, { fetch });
    expect(PAGE_DOI_TIMEOUT_MS).toBeLessThanOrEqual(3_000);
    await vi.advanceTimersByTimeAsync(PAGE_DOI_TIMEOUT_MS - 1);
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await settled)?.outcomes[0]?.result).toBe("timeout");
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("still stops when the caller aborts, rather than reporting a fallback", async () => {
    const controller = new AbortController();
    const settled = citationForPage(embedded, pageUrl, {
      fetch: hangingFetch(),
      signal: controller.signal,
    });
    controller.abort(new Error("Panel closed"));
    await expect(settled).rejects.toThrow("Panel closed");
  });

  it("uses registry claims when they answer in time and keeps page-only fields", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ type: "journal-article", title: "Registry title" }));
    const updates: CitationPreview[] = [];
    const settled = citationForPage(embedded, pageUrl, {
      fetch,
      onUpdate: (next) => updates.push(next),
    });
    expect(updates.map((next) => next.citation["title"])).toEqual(["Embedded title"]);
    expect(fetch).not.toHaveBeenCalled();
    const preview = await settled;
    expect(preview).toMatchObject({
      origin: "doi",
      citation: { title: "Registry title", abstract: "A page-only summary." },
      provenance: { title: { value: "Registry title", source: "registry:doi.org" } },
      outcomes: [{ provider: "doi.org", result: "ok" }],
    });
    expect(updates.map((next) => next.origin)).toEqual(["page", "doi"]);
    expect(updates[0]?.outcomes).toEqual([]);
  });

  it("gives explicit lookups longer than page saves, and says when the registry timed out", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await expect(
      resolveDoiCitation("10.1234/example", {
        fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")),
      }),
    ).rejects.toThrow("offline");
    expect(timeout).toHaveBeenCalledWith(DOI_RESOLUTION_TIMEOUT_MS);
    expect(DOI_RESOLUTION_TIMEOUT_MS).toBeGreaterThan(PAGE_DOI_TIMEOUT_MS);
    await expect(
      resolveDoiCitation("10.1234/example", { fetch: hangingFetch(), timeoutMs: 10 }),
    ).rejects.toThrow("within 0.01 seconds");
  });

  it.each([
    ["https://doi.org/10.1234/from-url", "10.1234/from-url"],
    ["https://arxiv.org/pdf/0704.0001v2.pdf", "10.48550/arXiv.0704.0001"],
  ])("can cite a PDF with no HTML from %s", async (url, doi) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ title: "PDF work" }));
    expect(await citationForPage(null, url, { fetch })).toMatchObject({
      origin: "doi",
      doi,
      citation: { title: "PDF work", DOI: doi },
    });
  });

  it("finds DOIs in claims and arXiv identifiers, preserving the linked PDF", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(() => Promise.resolve(Response.json({ title: "Work" })));
    const claimed: ClaimBatch = {
      ...page,
      claims: [
        ...page.claims,
        {
          field: "DOI",
          value: "10.1234/claimed",
          source: { kind: "page", signal: "highwire" },
          observedAt,
        },
      ],
      pdfUrl: "https://example.com/work.pdf",
    };
    expect(await citationForPage(claimed, pageUrl, { fetch })).toMatchObject({
      doi: "10.1234/claimed",
      pdfUrl: claimed.pdfUrl,
    });
    expect(
      await citationForPage({ ...page, identifiers: { arxiv: "arXiv:0704.0001v2" } }, pageUrl, {
        fetch,
      }),
    ).toMatchObject({ doi: "10.48550/arXiv.0704.0001" });
  });

  it("returns null without title evidence and rejects even a pre-aborted page-only capture", async () => {
    expect(await citationForPage(null, pageUrl)).toBeNull();
    await expect(
      citationForPage(page, pageUrl, { signal: AbortSignal.abort(new Error("Closed")) }),
    ).rejects.toThrow("Closed");
  });
});

describe("optional Citoid page citations", () => {
  const item = {
    itemType: "encyclopediaArticle",
    title: "Remote title",
    encyclopediaTitle: "Encyclopedia",
    date: "2026-10-20",
  };

  it.each([undefined, false] as const)("does not send the URL with citoid=%s", async (citoid) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const preview = await citationForPage(page, pageUrl, {
      fetch,
      ...(citoid !== undefined ? { citoid } : {}),
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(preview?.origin).toBe("page");
  });

  it("publishes page evidence immediately and upgrades it from an opted-in lookup", async () => {
    let resolve!: (value: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const updates: CitationPreview[] = [];
    const settled = citationForPage(page, pageUrl, {
      fetch,
      citoid: { queue: createProviderQueue() },
      onUpdate: (next) => updates.push(next),
    });
    expect(updates.map((next) => next.origin)).toEqual(["page"]);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    resolve(Response.json([item]));
    expect(await settled).toMatchObject({
      origin: "citoid",
      citation: {
        title: "Remote title",
        "container-title": "Encyclopedia",
        abstract: "A page-only summary.",
      },
      provenance: { title: { source: "site-adapter:citoid/encyclopediaArticle" } },
      outcomes: [{ provider: "citoid", result: "ok" }],
    });
    expect(updates.map((next) => next.origin)).toEqual(["page", "citoid"]);
  });

  it("cancels an opted-in Citoid lookup once a registry record is obtained", async () => {
    let resolveRegistry!: (response: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>((url) =>
      String(url).startsWith("https://doi.org/")
        ? new Promise((resolve) => {
            resolveRegistry = resolve;
          })
        : new Promise(() => undefined),
    );
    const settled = citationForPage(embedded, pageUrl, { fetch, citoid: {} });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    resolveRegistry(Response.json({ title: "Registered" }));
    expect(await settled).toMatchObject({
      origin: "doi",
      outcomes: [
        { provider: "doi.org", result: "ok" },
        { provider: "citoid", result: "cancelled" },
      ],
    });
    expect(fetch.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
  });

  it("can upgrade from Citoid while a DOI lookup is still pending", async () => {
    let resolveRegistry!: (response: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>((url) =>
      String(url).startsWith("https://doi.org/")
        ? new Promise((resolve) => {
            resolveRegistry = resolve;
          })
        : Promise.resolve(Response.json([item])),
    );
    const updates: CitationPreview[] = [];
    const settled = citationForPage(embedded, pageUrl, {
      fetch,
      citoid: {},
      onUpdate: (next) => updates.push(next),
    });
    await vi.waitFor(() => expect(updates.map((next) => next.origin)).toEqual(["page", "citoid"]));
    resolveRegistry(Response.json({ title: "Registered" }));
    expect((await settled)?.origin).toBe("doi");
    expect(updates.map((next) => next.origin)).toEqual(["page", "citoid", "doi"]);
  });

  it("uses Citoid if the known DOI failed, keeping both provider outcomes", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json([item]));
    expect(await citationForPage(embedded, pageUrl, { fetch, citoid: {} })).toMatchObject({
      origin: "citoid",
      outcomes: [
        { provider: "doi.org", result: "not-found" },
        { provider: "citoid", result: "ok" },
      ],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("follows a DOI discovered by Citoid in a bounded second round", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json([{ ...item, DOI: "10.1234/discovered" }]))
      .mockResolvedValueOnce(Response.json({ title: "Registered", type: "journal-article" }));
    const updates: CitationPreview[] = [];
    const preview = await citationForPage(page, pageUrl, {
      fetch,
      citoid: {},
      onUpdate: (next) => updates.push(next),
    });
    expect(preview).toMatchObject({ origin: "doi", doi: "10.1234/discovered" });
    expect(updates.map((next) => next.origin)).toEqual(["page", "citoid", "doi"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps a page preview after provider failures without publishing a false upgrade", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("Offline"));
    const updates: CitationPreview[] = [];
    const preview = await citationForPage(page, pageUrl, {
      fetch,
      citoid: {},
      onUpdate: (next) => updates.push(next),
    });
    expect(preview).toMatchObject({
      origin: "page",
      outcomes: [{ provider: "citoid", result: "failed" }],
    });
    expect(updates).toHaveLength(1);
  });

  it("rethrows a caller abort while Citoid is pending and never publishes afterward", async () => {
    const controller = new AbortController();
    const updates = vi.fn();
    const settled = citationForPage(page, pageUrl, {
      fetch: hangingFetch(),
      signal: controller.signal,
      citoid: {},
      onUpdate: updates,
    });
    controller.abort(new Error("Closed"));
    await expect(settled).rejects.toThrow("Closed");
    expect(updates).toHaveBeenCalledOnce();
  });
});

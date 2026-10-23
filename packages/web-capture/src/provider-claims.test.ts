import { afterEach, describe, expect, it, vi } from "vitest";

import { WIKIMEDIA_CITOID_ENDPOINT } from "./citation-lookup.js";
import { DOI_RESOLUTION_TIMEOUT_MS } from "./doi.js";
import { PAGE_DOI_TIMEOUT_MS } from "./page-citation.js";
import {
  citoidClaims,
  CITOID_TIMEOUT_MS,
  doiClaims,
  zoteroItemClaims,
  type CitoidClaimsOptions,
} from "./provider-claims.js";
import { createProviderQueue } from "./provider-queue.js";

import type { ClaimBatch } from "./claims.js";

const observedAt = "2026-10-21T00:00:00.000Z";
const now = (): Date => new Date(observedAt);
const pageUrl = "https://en.wikipedia.org/wiki/Australia";

// Reduced Citoid-shaped Wikipedia and newspaper records; transport-only fields stay out of CSL.
const australia = {
  key: "WQ7J6U3P",
  version: 0,
  itemType: "encyclopediaArticle",
  title: "Australia",
  encyclopediaTitle: "Wikipedia",
  abstractNote: "Australia is a country in Oceania.",
  date: "2026-10-20T23:44:12Z",
  language: "en",
  url: "https://en.wikipedia.org/w/index.php?title=Australia&oldid=1318957321",
  extra: "Page Version ID: 1318957321",
  libraryCatalog: "Wikipedia",
  accessDate: "2026-10-21T00:00:00Z",
  creators: [],
  tags: [],
  attachments: [],
};

const newspaper = {
  itemType: "newspaperArticle",
  title: "Scientists report new climate findings",
  publicationTitle: "The Guardian",
  abstractNote: "Researchers publish their latest results.",
  date: "2026-10-20",
  url: "https://www.theguardian.com/science/2026/oct/20/climate-findings",
  creators: [{ creatorType: "author", name: "Associated Press" }],
  language: "en-GB",
};

function lookup(provider: "doi.org" | "citoid", options: CitoidClaimsOptions): Promise<ClaimBatch> {
  return provider === "doi.org"
    ? doiClaims("10.1234/example", { queue: createProviderQueue(), ...options })
    : citoidClaims(pageUrl, { queue: createProviderQueue(), ...options });
}

afterEach(() => vi.useRealTimers());

describe("Zotero item claims", () => {
  it("keeps Wikipedia's title, container, revision date and permalink as site-adapter evidence", () => {
    const claims = zoteroItemClaims(australia, observedAt);
    expect(Object.fromEntries(claims.map(({ field, value }) => [field, value]))).toEqual({
      type: "entry-encyclopedia",
      title: "Australia",
      "container-title": "Wikipedia",
      abstract: "Australia is a country in Oceania.",
      issued: { "date-parts": [[2026, 10, 20]] },
      accessed: { "date-parts": [[2026, 10, 21]] },
      language: "en",
      URL: australia.url,
      source: "Wikipedia",
    });
    for (const claim of claims) {
      expect(claim).toMatchObject({
        source: { kind: "site-adapter", name: "citoid/encyclopediaArticle" },
        evidence: "Citoid encyclopediaArticle",
        observedAt,
      });
    }
  });

  it("classifies a newspaper article as generic remote and keeps its whole creator list", () => {
    const claims = zoteroItemClaims(newspaper, observedAt);
    expect(claims.find(({ field }) => field === "author")).toEqual({
      field: "author",
      value: [{ literal: "Associated Press" }],
      source: { kind: "generic-remote", name: "citoid" },
      evidence: "Citoid newspaperArticle",
      observedAt,
    });
  });

  it.each(["webpage", "newspaperArticle", "blogPost", "magazineArticle", "forumPost"])(
    "treats Embedded Metadata type %s as generic",
    (itemType) => {
      expect(zoteroItemClaims({ itemType, title: "Example" }, observedAt)[0]?.source).toEqual({
        kind: "generic-remote",
        name: "citoid",
      });
    },
  );

  it.each([
    "encyclopediaArticle",
    "computerProgram",
    "journalArticle",
    "book",
    "bookSection",
    "thesis",
    "report",
    "conferencePaper",
    "preprint",
    "dataset",
    "patent",
    "case",
    "statute",
    "videoRecording",
    "podcast",
    "document",
    "dictionaryEntry",
    "map",
    "film",
    "standard",
  ])("treats %s as a specific translator", (itemType) => {
    expect(zoteroItemClaims({ itemType, title: "Example" }, observedAt)[0]?.source).toEqual({
      kind: "site-adapter",
      name: `citoid/${itemType}`,
    });
  });
});

describe("successful remote claims", () => {
  it("turns every sanitized registry field into a claim with an injectable observation time", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: "registry-internal-id",
        type: "journal-article",
        title: "Registry title",
        "container-title": "Journal of Examples",
        issued: { "date-parts": [[2026, 10, 20]] },
        author: [{ family: "Example", given: "Ada" }],
        ISBN: "9780140449136",
        reference: [{ title: "Not a CSL field" }],
      }),
    );
    const batch = await doiClaims("10.1234/example", { fetch: fetcher, now });
    expect(batch.outcome).toEqual({ provider: "doi.org", result: "ok", elapsedMs: 0 });
    expect(batch.identifiers).toEqual({ doi: "10.1234/example", isbn: "9780140449136" });
    expect(batch.claims.map(({ field }) => field)).toEqual([
      "type",
      "title",
      "container-title",
      "issued",
      "author",
      "ISBN",
      "DOI",
    ]);
    expect(batch.claims.find(({ field }) => field === "type")?.value).toBe("article-journal");
    expect(
      batch.claims.every(
        (claim) =>
          claim.source.kind === "registry" &&
          claim.source.name === "doi.org" &&
          claim.evidence === "doi.org CSL" &&
          claim.observedAt === observedAt,
      ),
    ).toBe(true);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://doi.org/10.1234/example");
    const init = fetcher.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("Accept")).toBe(
      "application/vnd.citationstyles.csl+json",
    );
    expect(init?.credentials).toBe("omit");
  });

  it("fetches Citoid without credentials and uses the first item only", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([australia, newspaper]));
    const batch = await citoidClaims(pageUrl, { fetch: fetcher, now, clientName: "Reader (test)" });
    expect(batch.claims).toEqual(zoteroItemClaims(australia, observedAt));
    expect(batch.outcome).toEqual({ provider: "citoid", result: "ok", elapsedMs: 0 });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(`${WIKIMEDIA_CITOID_ENDPOINT}${encodeURIComponent(pageUrl)}`);
    expect(new Headers(init?.headers).get("Accept")).toBe("application/json");
    expect(new Headers(init?.headers).get("Api-User-Agent")).toBe("Reader (test)");
    expect(init?.credentials).toBe("omit");
  });

  it("allows a private Translation Server and exposes DOI and ISBN discoveries", async () => {
    const item = { ...newspaper, DOI: "doi:10.1234/discovered", ISBN: "978-0-14-044913-6" };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([item]));
    const batch = await citoidClaims(pageUrl, {
      citoidEndpoint: "https://translate.example/zotero/",
      fetch: fetcher,
      now,
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `https://translate.example/zotero/${encodeURIComponent(pageUrl)}`,
    );
    expect(batch.outcome?.provider).toBe("translation-server");
    expect(batch.identifiers).toEqual({ doi: "10.1234/discovered", isbn: "978-0-14-044913-6" });
    expect(batch.claims[0]?.source).toEqual({ kind: "generic-remote", name: "citoid" });
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Api-User-Agent")).toBe(
      "mdbase-reader",
    );
  });
});

describe("Citoid disclosure boundary", () => {
  it.each([
    "http://localhost/private",
    "http://localhost./private",
    "http://router.local/admin",
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://192.168.1.1/",
    "http://127.0.0.1/",
    "http://169.254.1.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://8.8.8.8/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://[fe80::1]/",
    "http://[2001:4860:4860::8888]/",
    "https://alice:secret@example.com/doc?token=secret#private",
    "https://example.com/private.pdf",
    "https://example.com/PRIVATE.PDF?download=1",
    "https://example.com/private%2Epdf",
    "file:///home/private.html",
  ])("never discloses protected URL %s", async (url) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const batch = await citoidClaims(url, { fetch, queue: createProviderQueue() });
    expect(fetch).not.toHaveBeenCalled();
    expect(batch).toMatchObject({ claims: [], outcome: { result: "blocked" } });
  });

  it("skips a known PDF media type even without a PDF extension", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await citoidClaims("https://example.com/download?id=1", {
      fetch,
      contentType: "Application/PDF; charset=binary",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps query parameters needed by articles, but strips fragments", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json([]));
    await citoidClaims("https://example.com/document?token=secret&article=1#private", { fetch });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      `${WIKIMEDIA_CITOID_ENDPOINT}${encodeURIComponent("https://example.com/document?token=secret&article=1")}`,
    );
  });
});

describe.each(["doi.org", "citoid"] as const)("%s cooldowns", (provider) => {
  it("uses host-wide cooldowns across distinct identifiers/target URLs", async () => {
    const queue = createProviderQueue();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "600" } }));
    await lookup(provider, { fetch, queue });
    const batch =
      provider === "doi.org"
        ? await doiClaims("10.1234/another", { fetch, queue, timeoutMs: 100 })
        : await citoidClaims("https://other.example/article", { fetch, queue, timeoutMs: 100 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(batch.outcome?.result).toBe("rate-limited");
    expect(batch.outcome?.retryAfterMs).toBeGreaterThan(599_000);
  });

  it("reports a new cooldown promptly for an already queued lookup", async () => {
    vi.useFakeTimers();
    const queue = createProviderQueue({ concurrency: 1 });
    let release!: (response: Response) => void;
    const active = queue.run(
      provider === "doi.org" ? "https://doi.org/occupied" : WIKIMEDIA_CITOID_ENDPOINT,
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(0);
    const fetch = vi.fn<typeof globalThis.fetch>();
    let result: string | undefined;
    const pending = lookup(provider, { fetch, queue, timeoutMs: 1_000 }).then((batch) => {
      result = batch.outcome?.result;
    });
    await vi.advanceTimersByTimeAsync(10);
    release(new Response(null, { status: 429, headers: { "Retry-After": "600" } }));
    await active;
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toBe("rate-limited");
    await pending;
    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds both the reported and tracked Retry-After to ten minutes", async () => {
    const queue = createProviderQueue();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "86400" } }));
    expect((await lookup(provider, { fetch, queue })).outcome?.retryAfterMs).toBe(600_000);
    expect((await lookup(provider, { fetch, queue })).outcome?.retryAfterMs).toBeLessThanOrEqual(
      600_000,
    );
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("Citoid cooldowns", () => {
  it("reports a pause longer than the deadline as rate-limited without queueing", async () => {
    const queue = createProviderQueue({ now: () => 0 });
    const limited = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "60" } }));
    await citoidClaims(pageUrl, { fetch: limited, now, queue });
    const fetcher = vi.fn<typeof fetch>();
    expect(await citoidClaims(pageUrl, { fetch: fetcher, now, queue })).toEqual({
      claims: [],
      outcome: { provider: "citoid", result: "rate-limited", elapsedMs: 0, retryAfterMs: 60_000 },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe.each(["doi.org", "citoid"] as const)("%s provider failures", (provider) => {
  it.each([
    [400, "not-found"],
    [404, "not-found"],
    [429, "rate-limited"],
    [403, "blocked"],
    [451, "blocked"],
    [500, "failed"],
    [503, "failed"],
  ])("maps HTTP %i to %s without throwing", async (status, result) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
    expect(await lookup(provider, { fetch: fetcher, now })).toEqual({
      claims: [],
      outcome: { provider, result, elapsedMs: 0 },
    });
  });

  it.each(["2", "Wed, 21 Oct 2026 00:00:02 GMT"])("reports Retry-After %s", async (retryAfter) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 429,
        headers: { "Retry-After": retryAfter },
      }),
    );
    const batch = await lookup(provider, { fetch: fetcher, now });
    expect(batch.outcome).toEqual({
      provider,
      result: "rate-limited",
      elapsedMs: 0,
      retryAfterMs: 2_000,
    });
  });

  it("reports network failures without exposing messages or URLs in diagnostics", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(`Offline: ${pageUrl}`));
    expect(await lookup(provider, { fetch: fetcher, now })).toEqual({
      claims: [],
      outcome: { provider, result: "failed", elapsedMs: 0 },
    });
  });

  it("reports malformed JSON as failure", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("not JSON"));
    expect((await lookup(provider, { fetch: fetcher, now })).outcome?.result).toBe("failed");
  });
});

describe("Citoid empty or malformed records", () => {
  it("reports an empty item array as not found", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));
    expect((await citoidClaims(pageUrl, { fetch: fetcher })).outcome?.result).toBe("not-found");
  });

  it.each([{}, [null, australia], ["not an item"]])(
    "does not skip a malformed first item",
    async (value) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(value));
      expect((await citoidClaims(pageUrl, { fetch: fetcher })).outcome?.result).toBe("failed");
    },
  );
});

describe.each(["doi.org", "citoid"] as const)("%s deadlines and aborts", (provider) => {
  it("bounds fetches that ignore their signal, with injected timers and elapsed time", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
    const batch = lookup(provider, {
      fetch: fetcher,
      now: () => new Date(),
      timeoutMs: 50,
      setTimeout,
      clearTimeout,
    });
    await vi.advanceTimersByTimeAsync(49);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await batch).toEqual({
      claims: [],
      outcome: { provider, result: "timeout", elapsedMs: 50 },
    });
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("also bounds a stalled response body", async () => {
    vi.useFakeTimers();
    const response = new Response();
    vi.spyOn(response, "json").mockImplementation(() => new Promise(() => undefined));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    const batch = lookup(provider, { fetch: fetcher, timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(50);
    expect((await batch).outcome?.result).toBe("timeout");
  });

  it("rethrows a caller abort, even if fetch ignores the signal", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
    const batch = lookup(provider, { fetch: fetcher, signal: controller.signal });
    const error = new Error("Panel closed");
    const rejection = expect(batch).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(error);
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not fetch when already aborted", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      lookup(provider, { fetch: fetcher, signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("remote claim timeout policy", () => {
  it("keeps the short page DOI timeout available as an explicit option", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
    const batch = doiClaims("10.1234/example", { fetch: fetcher, timeoutMs: PAGE_DOI_TIMEOUT_MS });
    await vi.advanceTimersByTimeAsync(PAGE_DOI_TIMEOUT_MS);
    expect((await batch).outcome?.result).toBe("timeout");
  });

  it.each(["doi.org", "citoid"] as const)("uses the %s default deadline", async (provider) => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
    const batch = lookup(provider, { fetch: fetcher, now: () => new Date() });
    const duration = provider === "doi.org" ? DOI_RESOLUTION_TIMEOUT_MS : CITOID_TIMEOUT_MS;
    await vi.advanceTimersByTimeAsync(duration);
    expect((await batch).outcome).toEqual({ provider, result: "timeout", elapsedMs: duration });
  });

  it("removes a Citoid lookup that times out while queued, before it can fetch", async () => {
    vi.useFakeTimers();
    const queue = createProviderQueue({ concurrency: 1 });
    let release!: (response: Response) => void;
    const active = queue.run(
      WIKIMEDIA_CITOID_ENDPOINT,
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(0);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([australia]));
    const batch = citoidClaims(pageUrl, { queue, fetch: fetcher, timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(50);
    expect((await batch).outcome?.result).toBe("timeout");
    release(new Response());
    await active;
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

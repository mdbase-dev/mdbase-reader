import { afterEach, describe, expect, it, vi } from "vitest";

import { lookUpCitationClaims } from "./citation-updates.js";
import { createProviderQueue } from "./provider-queue.js";

function address(input: string | URL | Request): string {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

function options(): {
  fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;
  queue: ReturnType<typeof createProviderQueue>;
} {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation((url) =>
      Promise.resolve(
        address(url).startsWith("https://doi.org/")
          ? Response.json({ title: "Registered" })
          : Response.json([{ itemType: "webpage", title: "Remote", DOI: "10.1234/discovered" }]),
      ),
    );
  return { fetch, queue: createProviderQueue() };
}

function urls(opts: ReturnType<typeof options>): string[] {
  return opts.fetch.mock.calls.map(([url]) => address(url));
}

afterEach(() => vi.useRealTimers());

describe("citation update claims", () => {
  it.each(["", "refresh"])("refreshes a known DOI registry-first: %j", async (query) => {
    const opts = options();
    const claims = await lookUpCitationClaims(
      { query, doi: "10.1234/existing", url: "https://example.org/work" },
      opts,
    );
    expect(urls(opts)).toEqual(["https://doi.org/10.1234/existing"]);
    expect(claims.find((claim) => claim.field === "title")).toMatchObject({
      value: "Registered",
      source: { kind: "registry", name: "doi.org" },
    });
  });

  it.each(["10.1234/typed", "doi:10.1234/typed", "  10.1234/typed  "])(
    "does not mix a typed DOI with the current work: %j",
    async (query) => {
      const opts = options();
      await lookUpCitationClaims(
        { query, doi: "10.1234/existing", url: "https://existing.example" },
        opts,
      );
      expect(urls(opts)).toEqual(["https://doi.org/10.1234/typed"]);
    },
  );

  it("only uses the typed URL and its discovered identifier", async () => {
    const opts = options();
    await lookUpCitationClaims(
      { query: "https://typed.example/", url: "https://existing.example", doi: "10.1234/existing" },
      opts,
    );
    expect(urls(opts)).toEqual([
      `https://en.wikipedia.org/api/rest_v1/data/citation/zotero/${encodeURIComponent("https://typed.example/")}`,
      "https://doi.org/10.1234/discovered",
    ]);
  });

  it.each([
    "https://doi.org/10.1234/known?token=secret#private",
    "https://publisher.example/doi/10.1234/known?token=secret#private",
    "https://publisher.example/doi/10.1234%2Fknown%3Ftoken=secret%23private",
  ])("extracts a DOI only from the URL pathname: %s", async (query) => {
    const opts = options();
    await lookUpCitationClaims({ query }, opts);
    expect(urls(opts)).toEqual(["https://doi.org/10.1234/known"]);
  });

  it("falls back to Citoid after registry failure without retrying the same DOI", async () => {
    const opts = options();
    opts.fetch.mockImplementation((url) =>
      Promise.resolve(
        address(url).startsWith("https://doi.org/")
          ? new Response(null, { status: 404 })
          : Response.json([{ itemType: "webpage", title: "Remote", DOI: "10.1234/known" }]),
      ),
    );
    const claims = await lookUpCitationClaims(
      { query: "refresh", doi: "10.1234/known", url: "https://example.org/work" },
      opts,
    );
    expect(urls(opts).map((url) => new URL(url).host)).toEqual(["doi.org", "en.wikipedia.org"]);
    expect(claims.find((claim) => claim.field === "title")?.value).toBe("Remote");
  });
});

describe("citation update deadlines", () => {
  it.each([8_000, 6_000])(
    "shares one %i ms deadline with late DOI enrichment",
    async (deadlineMs) => {
      vi.useFakeTimers();
      const opts = options();
      opts.fetch.mockImplementation(async (url) => {
        if (address(url).startsWith("https://doi.org/")) {
          return new Promise(() => undefined);
        }
        await new Promise((resolve) => setTimeout(resolve, deadlineMs - 100));
        return Response.json([
          { itemType: "journalArticle", title: "Found", DOI: "10.1234/discovered" },
        ]);
      });
      let completed = false;
      const lookup = lookUpCitationClaims(
        { query: "https://example.com/work" },
        {
          ...opts,
          ...(deadlineMs === 6_000 ? { deadlineMs } : {}),
        },
      ).then(() => {
        completed = true;
      });
      await vi.advanceTimersByTimeAsync(deadlineMs - 1);
      expect(completed).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await lookup;
      expect(completed).toBe(true);
      expect(opts.fetch).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("limits even an explicit DOI to three seconds", async () => {
    vi.useFakeTimers();
    const opts = options();
    opts.fetch.mockImplementation(() => new Promise(() => undefined));
    const lookup = lookUpCitationClaims({ query: "10.1234/known" }, opts);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await lookup).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

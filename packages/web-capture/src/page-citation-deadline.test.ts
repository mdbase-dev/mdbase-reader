import { afterEach, expect, it, vi } from "vitest";

import { citationForPage as lookupPage } from "./page-citation.js";
import { createProviderQueue } from "./provider-queue.js";

import type { ClaimBatch } from "./claims.js";

const citationForPage: typeof lookupPage = (page, url, options) =>
  lookupPage(page, url, { queue: createProviderQueue(), ...options });

const page: ClaimBatch = {
  claims: [
    {
      field: "title",
      value: "Page title",
      source: { kind: "page", signal: "html" },
      observedAt: "2026-10-21T00:00:00Z",
    },
  ],
};
const url = "https://example.com/work";
const pending: typeof fetch = () => new Promise(() => undefined);

afterEach(() => vi.useRealTimers());

it("starts Citoid only after a registry timeout, with the remaining overall budget", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(pending);
  const updates = vi.fn();
  const settled = citationForPage({ ...page, identifiers: { doi: "10.1234/work" } }, url, {
    fetch,
    deadlineMs: 6_000,
    citoid: { queue: createProviderQueue() },
    onUpdate: updates,
  });
  expect(updates).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(2_999);
  expect(fetch).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(3_000);
  expect(await settled).toMatchObject({
    citation: { title: "Page title" },
    outcomes: [
      { provider: "doi.org", result: "timeout", elapsedMs: 3_000 },
      { provider: "citoid", result: "timeout", elapsedMs: 3_000 },
    ],
  });
  expect(vi.getTimerCount()).toBe(0);
});

it("does not add another three seconds for a DOI discovered near the deadline", async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                Response.json([
                  { itemType: "journalArticle", title: "Remote title", DOI: "10.1234/discovered" },
                ]),
              ),
            5_500,
          ),
        ),
    )
    .mockImplementation(pending);
  const settled = citationForPage(page, url, { fetch, deadlineMs: 6_000, citoid: {} });
  await vi.advanceTimersByTimeAsync(5_500);
  expect(fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(500);
  expect(await settled).toMatchObject({
    origin: "citoid",
    outcomes: [
      { provider: "citoid", result: "ok" },
      { provider: "doi.org", result: "timeout", elapsedMs: 500 },
    ],
  });
});

it("counts queue time against the overall deadline", async () => {
  vi.useFakeTimers();
  const queue = createProviderQueue({ concurrency: 1 });
  const controller = new AbortController();
  let release!: (response: Response) => void;
  const occupied = queue.run(
    "https://en.wikipedia.org/occupied",
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    controller.signal,
  );
  const fetch = vi.fn(pending);
  const settled = citationForPage(page, url, { fetch, deadlineMs: 100, citoid: { queue } });
  await vi.advanceTimersByTimeAsync(100);
  expect(await settled).toMatchObject({
    citation: { title: "Page title" },
    outcomes: [{ provider: "citoid", result: "timeout" }],
  });
  expect(fetch).not.toHaveBeenCalled();
  release(new Response());
  await occupied;
});

it("never grants a second DOI a fresh three-second budget", async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(new Response(null, { status: 404 })), 2_500),
        ),
    )
    .mockResolvedValueOnce(
      Response.json([{ itemType: "journalArticle", title: "Remote", DOI: "10.1234/other" }]),
    )
    .mockImplementation(() => new Promise(() => undefined));
  const settled = citationForPage({ ...page, identifiers: { doi: "10.1234/work" } }, url, {
    fetch,
    citoid: {},
    timeoutMs: 10_000,
  });
  await vi.advanceTimersByTimeAsync(3_000);
  expect((await settled)?.outcomes).toMatchObject([
    { provider: "doi.org", result: "not-found" },
    { provider: "citoid", result: "ok" },
    { provider: "doi.org", result: "timeout", elapsedMs: 500 },
  ]);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("keeps page evidence available with no budget and starts no provider", async () => {
  const fetch = vi.fn(pending);
  const onUpdate = vi.fn();
  expect(
    await citationForPage(page, url, { fetch, citoid: {}, deadlineMs: 0, onUpdate }),
  ).toMatchObject({ origin: "page" });
  expect(onUpdate).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
});

it.each([404, 429, 403, 500, "timeout"] as const)(
  "silently falls back after Citoid %s",
  async (status) => {
    vi.useFakeTimers();
    const fetch =
      status === "timeout"
        ? pending
        : vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, { status }));
    const settled = citationForPage(page, url, {
      fetch,
      citoid: { queue: createProviderQueue() },
      deadlineMs: 50,
    });
    await vi.advanceTimersByTimeAsync(50);
    const preview = await settled;
    expect(preview?.origin).toBe("page");
    expect(preview?.problem).toBeUndefined();
    expect(preview?.outcomes).toHaveLength(1);
  },
);

it.each([
  [404, "The DOI registry did not find a citation for this DOI."],
  [429, "The DOI registry is receiving too many requests. Try again later."],
  [403, "The DOI registry blocked this lookup."],
  [500, "The DOI registry lookup failed."],
] as const)("uses a complete sentence for registry HTTP %s", async (status, problem) => {
  const preview = await citationForPage({ ...page, identifiers: { doi: "10.1234/work" } }, url, {
    fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status })),
  });
  expect(preview?.problem).toBe(problem);
});

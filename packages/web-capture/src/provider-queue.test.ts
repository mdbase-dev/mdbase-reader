import { afterEach, describe, expect, it, vi } from "vitest";

import { createProviderQueue, ProviderCooldownError, retryAfterMs } from "./provider-queue.js";

const endpoint = "https://en.wikipedia.org/api/rest_v1/data/citation/zotero/";

function deferredResponse(): { promise: Promise<Response>; resolve: (response: Response) => void } {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

afterEach(() => vi.useRealTimers());

describe("provider queue scheduling", () => {
  it("limits concurrency to three and starts queued requests in FIFO order", async () => {
    vi.useFakeTimers();
    const queue = createProviderQueue();
    const work = Array.from({ length: 5 }, deferredResponse);
    const order: number[] = [];
    const results = work.map((job, index) =>
      queue.run(`${endpoint}${String(index)}`, () => {
        order.push(index);
        return job.promise;
      }),
    );
    await flush();
    expect(order).toEqual([0, 1, 2]);
    work[1]!.resolve(new Response());
    await flush();
    expect(order).toEqual([0, 1, 2, 3]);
    work[0]!.resolve(new Response());
    await flush();
    expect(order).toEqual([0, 1, 2, 3, 4]);
    for (const job of work) {
      job.resolve(new Response());
    }
    await Promise.all(results);
  });

  it("limits different paths on one host together, but not unrelated hosts", async () => {
    vi.useFakeTimers();
    const queue = createProviderQueue({ concurrency: 1 });
    const active = deferredResponse();
    const first = queue.run(endpoint, () => active.promise);
    const sameHost = vi.fn(() => Promise.resolve(new Response()));
    const otherHost = vi.fn(() => Promise.resolve(new Response()));
    const second = queue.run("https://en.wikipedia.org/other/path", sameHost);
    const third = queue.run("https://translate.example/zotero/", otherHost);
    await flush();
    expect(sameHost).not.toHaveBeenCalled();
    expect(otherHost).toHaveBeenCalledOnce();
    active.resolve(new Response());
    await Promise.all([first, second, third]);
    expect(sameHost).toHaveBeenCalledOnce();
  });

  it("rejects invalid concurrency", () => {
    for (const concurrency of [0, -1, 1.5, Infinity, NaN]) {
      expect(() => createProviderQueue({ concurrency })).toThrow(RangeError);
    }
  });

  it("releases the slot after a rejected or synchronously throwing request", async () => {
    const queue = createProviderQueue({ concurrency: 1 });
    const failed = queue.run(endpoint, () => {
      throw new Error("offline");
    });
    const next = queue.run(endpoint, () => Promise.resolve(new Response()));
    await expect(failed).rejects.toThrow("offline");
    await expect(next).resolves.toBeInstanceOf(Response);
  });
});

describe("provider queue cooldowns", () => {
  it.each(["2", "Wed, 21 Oct 2026 00:00:02 GMT"])(
    "honours Retry-After %s before starting the next request",
    async (retryAfter) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-21T00:00:00Z"));
      const queue = createProviderQueue({ concurrency: 1 });
      const first = queue.run(endpoint, () =>
        Promise.resolve(
          new Response(null, { status: 429, headers: { "Retry-After": retryAfter } }),
        ),
      );
      const request = vi.fn(() => Promise.resolve(new Response()));
      const second = queue.run(endpoint, request);
      await first;
      await vi.advanceTimersByTimeAsync(1_999);
      expect(request).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await second;
      expect(request).toHaveBeenCalledOnce();
    },
  );

  it("rechecks queued deadlines immediately even when all other slots remain active", async () => {
    vi.useFakeTimers();
    const queue = createProviderQueue({ concurrency: 2 });
    const work = deferredResponse();
    const first = queue.run(endpoint, () => work.promise);
    const stillActive = deferredResponse();
    const second = queue.run(endpoint, () => stillActive.promise);
    const request = vi.fn(() => Promise.resolve(new Response()));
    const queued = queue.run(endpoint, request, undefined, 1_000);
    const rejection = expect(queued).rejects.toBeInstanceOf(ProviderCooldownError);
    await flush();
    work.resolve(new Response(null, { status: 429, headers: { "Retry-After": "600" } }));
    await first;
    await rejection;
    expect(request).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    stillActive.resolve(new Response());
    await second;
  });

  it("backs off repeated 429s without a header, capped at a minute", async () => {
    vi.useFakeTimers();
    const queue = createProviderQueue({ concurrency: 1 });
    const starts: number[] = [];
    const initial = Date.now();
    const work = Array.from({ length: 7 }, () =>
      queue.run(endpoint, () => {
        starts.push(Date.now() - initial);
        return Promise.resolve(new Response(null, { status: 429 }));
      }),
    );
    await vi.runAllTimersAsync();
    await Promise.all(work);
    expect(starts).toEqual([0, 5_000, 15_000, 35_000, 75_000, 135_000, 195_000]);
  });

  it("lets an in-flight success finish without cancelling another response's cooldown", async () => {
    vi.useFakeTimers();
    const queue = createProviderQueue({ concurrency: 2 });
    const active = deferredResponse();
    const first = queue.run(endpoint, () => active.promise);
    const limited = queue.run(endpoint, () => Promise.resolve(new Response(null, { status: 429 })));
    await limited;
    const request = vi.fn(() => Promise.resolve(new Response()));
    const next = queue.run(endpoint, request);
    active.resolve(new Response());
    await first;
    await vi.advanceTimersByTimeAsync(4_999);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await next;
  });

  it("caps a provider's Retry-After at ten minutes", async () => {
    let clock = 0;
    const queue = createProviderQueue({ now: () => clock });
    await queue.run(endpoint, () =>
      Promise.resolve(new Response(null, { status: 429, headers: { "Retry-After": "86400" } })),
    );
    expect(queue.cooldownMs(endpoint)).toBe(600_000);
    clock = 600_000;
    expect(queue.cooldownMs(endpoint)).toBe(0);
  });

  it("parses seconds and past dates, and rejects malformed Retry-After", () => {
    expect(retryAfterMs("1.5", 0)).toBe(1_500);
    expect(retryAfterMs("Wed, 21 Oct 2026 00:00:00 GMT", Date.parse("2026-10-22"))).toBe(0);
    expect(retryAfterMs(null)).toBeUndefined();
    expect(retryAfterMs(" ")).toBeUndefined();
    expect(retryAfterMs("later")).toBeUndefined();
  });
});

describe("provider queue cancellation", () => {
  it("removes an aborted queued request, preserving the remaining order", async () => {
    vi.useFakeTimers();
    const queue = createProviderQueue({ concurrency: 1 });
    const active = deferredResponse();
    const first = queue.run(endpoint, () => active.promise);
    const controller = new AbortController();
    const skipped = vi.fn(() => Promise.resolve(new Response()));
    const cancelled = queue.run(endpoint, skipped, controller.signal);
    const rejection = expect(cancelled).rejects.toThrow("Panel closed");
    const last = queue.run(endpoint, () => Promise.resolve(new Response()));
    controller.abort(new Error("Panel closed"));
    await rejection;
    active.resolve(new Response());
    await Promise.all([first, last]);
    expect(skipped).not.toHaveBeenCalled();
  });

  it("does not enqueue an already aborted request", async () => {
    const queue = createProviderQueue();
    const request = vi.fn(() => Promise.resolve(new Response()));
    await expect(queue.run(endpoint, request, AbortSignal.abort())).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("clears the cooldown timer when its only queued request aborts", async () => {
    vi.useFakeTimers();
    const queue = createProviderQueue({
      now: () => Date.now(),
      setTimeout,
      clearTimeout,
      concurrency: 1,
    });
    await queue.run(endpoint, () => Promise.resolve(new Response(null, { status: 429 })));
    const controller = new AbortController();
    const next = queue.run(endpoint, () => Promise.resolve(new Response()), controller.signal);
    const rejection = expect(next).rejects.toMatchObject({ name: "AbortError" });
    await flush();
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });
});

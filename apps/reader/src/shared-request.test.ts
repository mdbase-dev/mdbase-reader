import { describe, expect, it, vi } from "vitest";

import { SharedRequests } from "./shared-request.js";

function deferred<Value>(): {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
  readonly reject: (reason: unknown) => void;
} {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("shared pending requests", () => {
  it("shares work and progress, replaying the latest snapshot to later subscribers", async () => {
    const requests = new SharedRequests<string, string, number>();
    const result = deferred<string>();
    let publish!: (value: number) => void;
    const load = vi.fn((_signal: AbortSignal, progress: (value: number) => void) => {
      publish = progress;
      return result.promise;
    });
    const firstProgress = vi.fn();
    const secondProgress = vi.fn();
    const first = requests.get("library", {}, load, firstProgress);
    await Promise.resolve();
    publish(16);
    const second = requests.get("library", {}, load, secondProgress);
    expect(secondProgress).toHaveBeenCalledWith(16);
    publish(32);
    result.resolve("complete");
    await expect(first).resolves.toBe("complete");
    await expect(second).resolves.toBe("complete");
    expect(load).toHaveBeenCalledOnce();
    expect(firstProgress.mock.calls).toEqual([[16], [32]]);
  });

  it("isolates cancellation, aborting underlying work only after the last caller leaves", async () => {
    const requests = new SharedRequests<string, string>();
    const result = deferred<string>();
    const load = vi.fn((_signal: AbortSignal) => result.promise);
    const one = new AbortController();
    const two = new AbortController();
    const first = requests.get("source", { signal: one.signal }, load);
    const second = requests.get("source", { signal: two.signal }, load);
    const firstRejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const secondRejected = expect(second).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    one.abort();
    await firstRejected;
    expect(load.mock.calls[0]?.[0].aborted).toBe(false);
    two.abort();
    await secondRejected;
    expect(load.mock.calls[0]?.[0].aborted).toBe(true);
    // An abandoned response must not remove a newer request for the same key.
    const fresh = deferred<string>();
    const retryLoad = vi.fn(() => fresh.promise);
    const retry = requests.get("source", {}, retryLoad);
    result.resolve("abandoned");
    await Promise.resolve();
    await Promise.resolve();
    const joined = requests.get("source", {}, retryLoad);
    fresh.resolve("fresh");
    expect(await retry).toBe("fresh");
    expect(await joined).toBe("fresh");
    expect(retryLoad).toHaveBeenCalledOnce();
  });

  it("allows the remaining caller to finish after another caller cancels", async () => {
    const requests = new SharedRequests<string, string>();
    const result = deferred<string>();
    const load = vi.fn(() => result.promise);
    const controller = new AbortController();
    const first = requests.get("source", { signal: controller.signal }, load);
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = requests.get("source", {}, load);
    controller.abort();
    result.resolve("source");
    await rejected;
    await expect(second).resolves.toBe("source");
    expect(load).toHaveBeenCalledOnce();
  });

  it("does not start already-cancelled requests and retries failures", async () => {
    const requests = new SharedRequests<string, string>();
    const load = vi.fn(() => Promise.reject(new Error("offline")));
    const controller = new AbortController();
    controller.abort();
    await expect(requests.get("source", { signal: controller.signal }, load)).rejects.toMatchObject(
      { name: "AbortError" },
    );
    expect(load).not.toHaveBeenCalled();
    await expect(requests.get("source", {}, load)).rejects.toThrow("offline");
    await expect(requests.get("source", {}, load)).rejects.toThrow("offline");
    expect(load).toHaveBeenCalledTimes(2);
  });
});

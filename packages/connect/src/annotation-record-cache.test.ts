import { describe, expect, it, vi } from "vitest";

import { AnnotationRecordCache } from "./annotation-record-cache.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, RecordDocument } from "@mdbase-dev/connect";

const document: RecordDocument = {
  path: "annotations/one.md",
  revision: "rev-1",
  types: [],
  frontmatter: {},
  effectiveFrontmatter: {},
  file: {},
  body: "Original",
};
const ok = (value: RecordDocument): ConnectOutcome<RecordDocument> => ({
  ok: true,
  value,
  diagnostics: [],
});

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function cacheFor(read: ReturnType<typeof vi.fn>, now?: () => number): AnnotationRecordCache {
  return new AnnotationRecordCache({ read } as unknown as ReaderConnectClient, now);
}

describe("AnnotationRecordCache", () => {
  it("shares in-flight reads without letting one subscriber cancel another", async () => {
    const response = deferred<ConnectOutcome<RecordDocument>>();
    const read = vi.fn<ReaderConnectClient["read"]>(() => response.promise);
    const cache = cacheFor(read);
    const controller = new AbortController();
    const first = cache.read(document.path, { signal: controller.signal });
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = cache.read(document.path);
    controller.abort();
    await rejected;
    expect(read.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    response.resolve(ok(document));
    await expect(second).resolves.toBe(document);
    await expect(cache.read(document.path)).resolves.toBe(document);
    expect(read).toHaveBeenCalledOnce();
  });

  it("aborts abandoned work and permits a new caller to start immediately", async () => {
    const response = deferred<ConnectOutcome<RecordDocument>>();
    const read = vi.fn().mockReturnValueOnce(response.promise).mockResolvedValue(ok(document));
    const cache = cacheFor(read);
    const controller = new AbortController();
    const first = cache.read(document.path, { signal: controller.signal });
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    expect(read.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    await expect(cache.read(document.path)).resolves.toBe(document);
    response.resolve(ok({ ...document, body: "Abandoned stale response" }));
    await Promise.resolve();
    await expect(cache.read(document.path)).resolves.toBe(document);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("expires cached records and bypasses them on explicit refresh", async () => {
    let time = 0;
    const read = vi.fn().mockResolvedValue(ok(document));
    const cache = cacheFor(read, () => time);
    await cache.read(document.path);
    await cache.read(document.path);
    expect(read).toHaveBeenCalledOnce();
    await cache.read(document.path, {}, true);
    time = 15_001;
    await cache.read(document.path);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("does not let a pre-mutation response overwrite a newer revision", async () => {
    const response = deferred<ConnectOutcome<RecordDocument>>();
    const cache = cacheFor(vi.fn(() => response.promise));
    const pending = cache.read(document.path);
    const updated = { ...document, revision: "rev-2", body: "Saved" };
    cache.put(updated);
    response.resolve(ok(document));
    await expect(pending).resolves.toBe(updated);
    await expect(cache.read(document.path)).resolves.toBe(updated);
  });

  it("evicts deleted records, including pending reads", async () => {
    const response = deferred<ConnectOutcome<RecordDocument>>();
    const read = vi.fn().mockReturnValueOnce(response.promise).mockResolvedValue(ok(document));
    const cache = cacheFor(read);
    const pending = cache.read(document.path);
    cache.delete(document.path);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    response.resolve(ok(document));
    await rejected;
    await cache.read(document.path);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("does not cache failures", async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(ok(document));
    const cache = cacheFor(read);
    await expect(cache.read(document.path)).rejects.toThrow("offline");
    await expect(cache.read(document.path)).resolves.toBe(document);
    expect(read).toHaveBeenCalledTimes(2);
  });
});

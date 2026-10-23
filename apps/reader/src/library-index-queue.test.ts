import { fileId, fileRevision } from "@mdbase-reader/core";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";

import { libraryHtmlReadLimit, runLibraryIndexQueue } from "./library-index-queue.js";
import { LibraryTextIndex } from "./library-text-index.js";
import { LibraryTextStore } from "./library-text-store.js";

import type { LibraryIndexQueueOptions } from "./library-index-queue.js";
import type { DocumentDescriptor } from "@mdbase-reader/core";

const revisionA = `sha256:${"a".repeat(64)}`;
const revisionB = `sha256:${"b".repeat(64)}`;

function file(id = "file", revision = revisionA): DocumentDescriptor {
  return {
    fileId: fileId(id),
    file: `${id}.html`,
    revision: fileRevision(revision),
    mediaType: "text/html",
    role: "primary",
  };
}
function fixture(): LibraryIndexQueueOptions {
  return {
    files: [file()],
    complete: true,
    client: new LibraryTextIndex("collection", new LibraryTextStore(new IDBFactory())),
    gateway: {
      readFile: vi.fn(() =>
        Promise.resolve({
          bytes: new TextEncoder().encode("text"),
          path: "file.html",
          mediaType: "text/html",
        }),
      ),
    },
    signal: new AbortController().signal,
    idle: vi.fn(() => Promise.resolve()),
    extract: vi.fn((bytes: Uint8Array) => new TextDecoder().decode(bytes)),
    attempted: new Set(),
    report: vi.fn(),
  };
}

describe("serial idle library indexing", () => {
  it("never reads unchanged revisions, including across sessions, but reindexes changed ones", async () => {
    const options = fixture();
    await runLibraryIndexQueue(options);
    await runLibraryIndexQueue({ ...options, attempted: new Set() });
    expect(options.gateway.readFile).toHaveBeenCalledTimes(1);
    await runLibraryIndexQueue({ ...options, files: [file("file", revisionB)] });
    expect(options.gateway.readFile).toHaveBeenCalledTimes(2);
    expect(options.gateway.readFile).toHaveBeenLastCalledWith("file.html", revisionB, {
      signal: options.signal,
      maxBytes: libraryHtmlReadLimit,
    });
    expect(options.idle).toHaveBeenCalledTimes(6);
  });

  it("aborts in-flight reads on collection close; no extraction, write or publication follows", async () => {
    const options = fixture();
    const controller = new AbortController();
    let finish!: (
      value: Awaited<ReturnType<LibraryIndexQueueOptions["gateway"]["readFile"]>>,
    ) => void;
    options.gateway.readFile = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<LibraryIndexQueueOptions["gateway"]["readFile"]>>>(
          (resolve) => {
            finish = resolve;
          },
        ),
    );
    const pending = runLibraryIndexQueue({ ...options, signal: controller.signal });
    await vi.waitFor(() => expect(options.gateway.readFile).toHaveBeenCalled());
    controller.abort();
    finish({ bytes: new Uint8Array(), path: "file.html", mediaType: "text/html" });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(options.extract).not.toHaveBeenCalled();
    expect(options.attempted.size).toBe(0);
  });

  it("reports file failures, skips oversized files, and doesn't repeatedly read failures", async () => {
    const options = fixture();
    options.gateway.readFile = vi.fn(() =>
      Promise.resolve({
        bytes: new Uint8Array(libraryHtmlReadLimit + 1),
        path: "file.html",
        mediaType: "text/html",
      }),
    );
    await runLibraryIndexQueue(options);
    await runLibraryIndexQueue(options);
    expect(options.gateway.readFile).toHaveBeenCalledOnce();
    expect(options.extract).not.toHaveBeenCalled();
    expect(options.report).toHaveBeenLastCalledWith({ checked: 1, total: 1, skipped: 1 });
  });

  it("storage/quota failure escapes so the owner falls back, without downloading the rest", async () => {
    const options = fixture();
    options.client.put = vi.fn(() =>
      Promise.reject(new DOMException("Full", "QuotaExceededError")),
    );
    await expect(
      runLibraryIndexQueue({ ...options, files: [file("one"), file("two")] }),
    ).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(options.gateway.readFile).toHaveBeenCalledOnce();
  });

  it("indexes 500 synthetic documents with an event-loop opportunity before every phase", async () => {
    const options = fixture();
    const text = "A synthetic saved page about literature. ".repeat(200);
    let heartbeats = 0;
    const timer = setInterval(() => heartbeats++, 0);
    let yields = 0;
    const start = performance.now();
    try {
      await runLibraryIndexQueue({
        ...options,
        files: Array.from({ length: 500 }, (_, index) => file(String(index))),
        extract: () => text,
        idle: async (signal) => {
          signal.throwIfAborted();
          yields++;
          await new Promise((resolve) => setTimeout(resolve, 0));
        },
      });
    } finally {
      clearInterval(timer);
    }
    const indexingMs = performance.now() - start;
    const index = options.client as LibraryTextIndex;
    const searchStart = performance.now();
    const hits = index.search("synthetic literature");
    const queryMs = performance.now() - searchStart;
    expect(hits).toHaveLength(500);
    expect(yields).toBe(1500);
    expect(heartbeats).toBeGreaterThanOrEqual(500);
    expect(queryMs).toBeLessThan(100);
    // Local diagnostics, not production/browser latency evidence.
    process.stdout.write(
      `${JSON.stringify({ documents: 500, textCharacters: text.length, indexingMs, queryMs, heartbeats, yields })}\n`,
    );
  }, 15000);
});

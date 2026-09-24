import { describe, expect, it, vi } from "vitest";

import { problemMessage, readerSourceUrl, sourceForUrl, tabIdParameter } from "./capture-model.js";

import type { ReaderConnectedCollection } from "@mdbase-reader/connect";
import type { SourceSummary } from "@mdbase-reader/core";

describe("extension capture model", () => {
  it("asks the store for the page and its submitted URL instead of scanning the library", async () => {
    const matching = { id: "rabbit" } as SourceSummary;
    const findByUrl = vi.fn((_collection: string, url: string) =>
      Promise.resolve(url.includes("submitted") ? matching : null),
    );
    const list = vi.fn();
    const collection = {
      collectionId: "library",
      sources: { findByUrl, list },
    } as unknown as ReaderConnectedCollection;
    await expect(
      sourceForUrl(collection, "https://example.com/canonical", ["https://example.com/submitted"]),
    ).resolves.toBe(matching);
    expect(list).not.toHaveBeenCalled();
  });

  it("falls back to a paged scan that skips sources with malformed URLs", async () => {
    const malformed = { url: "10.1234/example" } as SourceSummary;
    const matching = {
      id: "rabbit",
      url: "https://en.wikipedia.org/wiki/European_rabbit#History",
    } as SourceSummary;
    const collection = {
      collectionId: "library",
      sources: {
        list: vi
          .fn()
          .mockResolvedValueOnce({ items: [malformed], nextCursor: "2" })
          .mockResolvedValueOnce({ items: [matching] }),
      },
    } as unknown as ReaderConnectedCollection;

    await expect(
      sourceForUrl(collection, "https://www.en.wikipedia.org/wiki/European_rabbit?utm_source=x"),
    ).resolves.toBe(matching);
  });

  it("links to the exact source and collection, not just the library", () => {
    const url = new URL(
      readerSourceUrl({ collectionId: "test collection", id: "source & id" } as SourceSummary),
    );
    expect(url.origin).toBe("https://lab.mdbase-reader.pages.dev");
    expect(url.searchParams.get("collection")).toBe("test collection");
    expect(url.searchParams.get("source")).toBe("source & id");
  });

  it("requires a valid source tab", () => {
    expect(tabIdParameter("chrome-extension://reader/capture.html?tab=42")).toBe(42);
    expect(() => tabIdParameter("chrome-extension://reader/capture.html")).toThrow(
      "active browser tab",
    );
  });

  it("retains nested SDK causes in user-facing diagnostics", () => {
    const transport = new Error("WebSocket closed before the receipt arrived");
    const transfer = new Error("The file transfer could not be completed.", { cause: transport });

    expect(problemMessage(transfer)).toBe(
      "The file transfer could not be completed. — WebSocket closed before the receipt arrived",
    );
  });
});

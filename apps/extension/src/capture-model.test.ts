import { describe, expect, it } from "vitest";

import {
  normalizedUrl,
  problemMessage,
  readerSourceUrl,
  sameNormalizedUrl,
  sourceForUrl,
  tabIdParameter,
} from "./capture-model.js";

import type { ReaderConnectedCollection } from "@mdbase-reader/connect";
import type { SourceSummary } from "@mdbase-reader/core";

describe("extension capture model", () => {
  it("normalizes tracking parameters without discarding meaningful query state", () => {
    expect(normalizedUrl("https://example.com/story/?utm_source=mail&page=2#note")).toBe(
      "https://example.com/story?page=2",
    );
  });

  it("ignores legacy source identifiers that are not absolute URLs", () => {
    const expected = normalizedUrl("https://en.wikipedia.org/wiki/European_rabbit");

    expect(sameNormalizedUrl("10.1234/example", expected)).toBe(false);
    expect(sameNormalizedUrl("sources/rabbit.md", expected)).toBe(false);
    expect(
      sameNormalizedUrl("https://en.wikipedia.org/wiki/European_rabbit#History", expected),
    ).toBe(true);
  });

  it("continues a duplicate scan past sources with malformed URLs", async () => {
    const malformed = { url: "10.1234/example" } as SourceSummary;
    const matching = {
      id: "rabbit",
      url: "https://en.wikipedia.org/wiki/European_rabbit#History",
    } as SourceSummary;
    const collection = {
      collectionId: "library",
      sources: {
        listPages: async function* () {
          yield await Promise.resolve({ items: [malformed, matching] });
        },
      },
    } as unknown as ReaderConnectedCollection;

    await expect(
      sourceForUrl(collection, "https://en.wikipedia.org/wiki/European_rabbit"),
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

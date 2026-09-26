import { describe, expect, it, vi } from "vitest";

import { hash, object, type Fields, type MigrationPlan } from "./model.js";
import { ReadwiseClient } from "./readwise-client.js";
import { scanReadwise } from "./readwise.js";
import { runMigration, type ImportedFile, type MigrationTarget } from "./run.js";
import {
  kindleBook,
  readerDocument,
  readerHighlight,
  readerOnlyHighlight,
  readwiseResponses,
} from "./tests/readwise-fixture.js";
const signal = (): AbortSignal => new AbortController().signal;
const requestUrl = (input: Parameters<typeof fetch>[0]): URL =>
  new URL(input instanceof Request ? input.url : input.toString());
function fixtureFetch(): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockImplementation((input) => {
    const url = requestUrl(input);
    return Promise.resolve(
      new Response(JSON.stringify(readwiseResponses(url)), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
}
async function scan(includeFeed = false): Promise<MigrationPlan> {
  return scanReadwise(
    new ReadwiseClient("fixture-token", fixtureFetch(), 0),
    includeFeed,
    signal(),
    vi.fn(),
  );
}
function importKey(fields: Fields): unknown {
  return object(fields["import"])["key"];
}
function memoryTarget(): { target: MigrationTarget; records: Map<string, Fields> } {
  const records = new Map<string, Fields>();
  const files = new Map<string, ImportedFile>();
  const target: MigrationTarget = {
    collectionId: "test-collection",
    existing: () => Promise.resolve(new Map(records)),
    files: () => Promise.resolve(new Map(files)),
    upload: async (path, blob) => {
      const file = {
        fileId: `file-${String(files.size)}`,
        path,
        contentDigest: `sha256:${await hash(blob)}`,
      };
      files.set(path, file);
      return file;
    },
    create: (record, fields) => {
      records.set(record.id, fields);
      return Promise.resolve();
    },
  };
  return { target, records };
}
describe("classic Readwise books", () => {
  it("imports a Kindle book as a file-less source with location-labelled highlights", async () => {
    const plan = await scan();
    const kindle = plan.sources.find((s) => s.key === "v2-book:7001");
    expect(kindle).toBeDefined();
    expect(kindle?.documents).toEqual([]);
    expect(kindle?.fields).toMatchObject({
      title: "The Example Book",
      kind: "book",
      authors: ["Grace Example"],
      tags: ["fiction"],
      cover_url: kindleBook["cover_image_url"],
      identifiers: { asin: "B000EXAMPLE" },
      saved_at: "2025-06-01T20:15:00.000Z",
    });
    expect(object(object(kindle?.fields["import"])["native"])).not.toHaveProperty("highlights");
    const highlights = plan.annotations.filter((a) => a.sourceKey === "v2-book:7001");
    const first = highlights.find((a) => a.key === "v2:11001");
    expect(first?.fileKey).toBeUndefined();
    expect(first?.body).toBe("> It was the first line of a novel.\n\nGood opening");
    expect(first?.fields).toMatchObject({
      annotation_type: "highlight",
      created_at: "2025-06-01T20:15:00.000Z",
      color: "blue",
      tags: ["favorite"],
      locator: { label: "location 152" },
      target: { quote: { exact: "It was the first line of a novel." } },
    });
    const second = highlights.find((a) => a.key === "v2:11002");
    // No highlighted_at: fall back to Readwise's creation time.
    expect(second?.fields["created_at"]).toBe("2025-06-04T09:00:00.000Z");
    expect(second?.fields["locator"]).toEqual({ label: "location 2310" });
    expect(second?.body).toBe("> A later passage,\n> over two lines.\n\n");
    expect(highlights.find((a) => a.key === "v2:11003")).toBeUndefined();
    const note = highlights.find((a) => a.key === "document-note:v2-book:7001");
    expect(note?.fields["annotation_type"]).toBe("note");
    expect(note?.body).toBe("Read on holiday; revisit chapter 3.");
  });
  it("imports other classic categories and counts every skipped item", async () => {
    const plan = await scan();
    const podcast = plan.sources.find((s) => s.key === "v2-book:7002");
    expect(podcast?.fields).toMatchObject({
      kind: "podcast",
      url: "https://podcasts.example/episode-12",
    });
    expect(plan.annotations.find((a) => a.key === "v2:12001")?.fields["locator"]).toEqual({
      label: "time_offset 185",
    });
    expect(plan.sources.some((s) => s.key === "v2-book:7003")).toBe(false);
    expect(plan.sources.some((s) => s.key === "v2-book:5002")).toBe(false);
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        "Unsaved Feed items excluded (choose “Include unsaved Feed items” to import): 42",
        "Deleted Readwise books skipped: 1",
        "Discarded Readwise highlights skipped (kept in the native archive): 1",
        "Readwise books whose Reader document is outside this import (unsaved Feed, or removed from Reader): 1",
        "Highlights on those books not imported: 1",
      ]),
    );
    // The Feed highlight is counted once, via its v2 book, not again as a Reader row.
    expect(plan.warnings.some((w) => w.startsWith("Reader highlights on documents outside"))).toBe(
      false,
    );
    expect(plan.summary.categories).toEqual([
      { label: "Reader articles", sources: 1, annotations: 2 },
      { label: "Readwise books (Kindle, Apple Books…)", sources: 1, annotations: 3 },
      { label: "Readwise podcasts", sources: 1, annotations: 1 },
    ]);
  });
  it("keeps Reader documents joined by ID, with no duplicate classic source", async () => {
    const plan = await scan();
    expect(plan.sources.filter((s) => s.key === readerDocument["id"])).toHaveLength(1);
    expect(plan.sources.some((s) => s.key === "v2-book:5001")).toBe(false);
    const joined = plan.annotations.find((a) => a.key === readerHighlight["id"]);
    expect(joined?.fileKey).toBe(readerDocument["id"]);
    expect(joined?.fields["color"]).toBe("yellow");
    // A Reader row's `location` is its inbox state, not a position.
    const readerOnly = plan.annotations.find((a) => a.key === readerOnlyHighlight["id"]);
    expect(readerOnly?.fields["locator"]).toBeUndefined();
    expect(JSON.stringify(plan.sources.map((s) => s.fields))).not.toContain("saved article body");
  });
  it("lists only library locations without the Feed, and everything with it", async () => {
    const without = fixtureFetch();
    await scanReadwise(new ReadwiseClient("fixture-token", without, 0), false, signal(), vi.fn());
    const listed = without.mock.calls.map(([input]) => requestUrl(input).searchParams);
    expect(listed.filter((p) => p.get("withHtmlContent") && p.get("location") === "feed")).toEqual(
      [],
    );
    expect(listed.filter((p) => p.get("pageCursor") === "7002")).toHaveLength(1);
    const withFeed = fixtureFetch();
    await scanReadwise(new ReadwiseClient("fixture-token", withFeed, 0), true, signal(), vi.fn());
    const v3 = withFeed.mock.calls
      .map(([input]) => requestUrl(input))
      .filter((u) => u.pathname === "/api/v3/list/");
    expect(v3).toHaveLength(1);
    expect(v3[0]?.searchParams.get("location")).toBeNull();
  });
  it("gives stable identities so a re-scan and re-import creates nothing new", async () => {
    const a = await scan();
    const b = await scan();
    expect(b.sources.map((s) => s.id)).toEqual(a.sources.map((s) => s.id));
    expect(b.annotations.map((s) => s.id)).toEqual(a.annotations.map((s) => s.id));
    expect(new Set(a.annotations.map((x) => x.id)).size).toBe(a.annotations.length);
    const ids = new Set([...a.sources, ...a.annotations].map((r) => r.id));
    expect(ids.size).toBe(a.sources.length + a.annotations.length);
    const { target, records } = memoryTarget();
    const first = await runMigration(a, target, signal(), vi.fn());
    expect(first.created).toBe(a.sources.length + a.annotations.length);
    expect(importKey(records.get(a.sources.find((s) => s.key === "v2-book:7001")!.id)!)).toBe(
      "v2-book:7001",
    );
    const second = await runMigration(b, target, signal(), vi.fn());
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(b.sources.length + b.annotations.length);
    expect(records.size).toBe(a.sources.length + a.annotations.length);
  });
});
describe("Readwise client resilience", () => {
  it("retries a gateway timeout and reports unreadable responses plainly", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 504, headers: { "Retry-After": "1" } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [{ id: "a" }], nextPageCursor: null })),
      )
      .mockResolvedValueOnce(new Response("<html>maintenance</html>"));
    const client = new ReadwiseClient("fixture-token", fetcher, 0);
    expect(await client.all("/api/v2/export/", {}, signal(), vi.fn())).toEqual([{ id: "a" }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(client.page({}, signal())).rejects.toThrow(
      "Readwise returned an unreadable response. Scan again later.",
    );
  });
});

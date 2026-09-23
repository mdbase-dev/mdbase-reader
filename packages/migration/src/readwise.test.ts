import { describe, expect, it, vi } from "vitest";

import { object } from "./model.js";
import { ReadwiseClient, delay, downloadReadwiseFile } from "./readwise-client.js";
import { freshReadwiseUrl } from "./readwise-sources.js";
import { scanReadwise } from "./readwise.js";
const signal = (): AbortSignal => new AbortController().signal;
const response = (value: unknown): Response =>
  new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
describe("Readwise read-only adapter", () => {
  it("calls fetch without an incompatible receiver, as browsers require", async () => {
    const fetcher = function (this: unknown): Promise<Response> {
      expect(this).toBeUndefined();
      return Promise.resolve(response({ results: [] }));
    };
    await new ReadwiseClient("fixture-token", fetcher, 0).page({}, signal());
  });
  it("paginates with Authorization only at the API and detects repeated cursors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(response({ results: [], nextPageCursor: "same" })));
    const client = new ReadwiseClient("fixture-token", fetcher, 0);
    await expect(client.all("/api/v3/list/", {}, signal(), vi.fn())).rejects.toThrow(/repeated/u);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      credentials: "omit",
      redirect: "error",
      headers: { Authorization: "Token fixture-token" },
    });
    await expect(client.request("https://elsewhere.example/api/", {}, signal())).rejects.toThrow(
      /Invalid/u,
    );
    client.forget();
    await expect(client.page({}, signal())).rejects.toThrow(/cleared/u);
  });
  it("honours rate-limit backoff and aborts waits promptly", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "1" } }))
      .mockResolvedValue(response({ results: [] }));
    const started = Date.now();
    await new ReadwiseClient("fixture-token", fetcher, 0).page({}, signal());
    expect(Date.now() - started).toBeGreaterThanOrEqual(990);
    const abort = new AbortController();
    const wait = delay(60_000, abort.signal);
    abort.abort();
    await expect(wait).rejects.toThrow();
  });
  it("does not expose raw server error bodies or token values", async () => {
    const client = new ReadwiseClient(
      "fixture-token",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("private server response", { status: 401 })),
      0,
    );
    await expect(client.page({}, signal())).rejects.toThrow(
      "Readwise rejected this token or account access.",
    );
  });
});
describe("Readwise file transfers and mapping", () => {
  it("reuses unexpired signed links, with a safety margin", () => {
    const now = Date.parse("2026-01-01T00:30:00Z");
    expect(
      freshReadwiseUrl(
        `https://bucket.s3.amazonaws.com/file?Expires=${String((now + 120_000) / 1000)}`,
        now,
      ),
    ).toBe(true);
    expect(
      freshReadwiseUrl(
        `https://bucket.s3.amazonaws.com/file?Expires=${String((now + 30_000) / 1000)}`,
        now,
      ),
    ).toBe(false);
    expect(
      freshReadwiseUrl(
        "https://bucket.s3.amazonaws.com/file?X-Amz-Date=20260101T000000Z&X-Amz-Expires=3600",
        now,
      ),
    ).toBe(true);
    expect(freshReadwiseUrl("https://bucket.s3.amazonaws.com/file", now)).toBe(false);
  });
  it("never forwards the API token to source files or accepts arbitrary file hosts", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("%PDF-test"));
    await downloadReadwiseFile(
      "https://bucket.s3.amazonaws.com/file?signature=fixture",
      signal(),
      fetcher,
    );
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty("headers");
    await expect(
      downloadReadwiseFile("http://127.0.0.1/private", signal(), fetcher),
    ).rejects.toThrow(/unexpected/u);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("combines Reader sources with v2 highlights, excludes feed and archives no signed URLs", async () => {
    const rows = [
      {
        id: "doc",
        category: "article",
        location: "archive",
        title: "Fixture article",
        html_content: "<p>Exact quote</p>",
        reading_progress: 0.5,
        raw_source_url: "https://bucket.s3.amazonaws.com/private?signature=secret",
        tags: { reading: { name: "Reading" } },
        created_at: "2026-01-01T00:00:00Z",
      },
      { id: "feed", category: "rss", location: "feed", html_content: "<p>Feed-only</p>" },
      { id: "highlight", category: "highlight", parent_id: "doc", html_content: "Exact quote" },
      { id: "note", category: "note", parent_id: "highlight", html_content: "My note" },
    ];
    const books = [
      {
        source: "reader",
        external_id: "doc",
        highlights: [
          {
            id: 1,
            external_id: "highlight",
            text: "Exact quote",
            note: "My note",
            color: "yellow",
            tags: [{ name: "Important" }],
          },
        ],
      },
    ];
    const fetcher = vi.fn<typeof fetch>().mockImplementation((url) =>
      Promise.resolve(
        response({
          results: (url instanceof Request ? url.url : url.toString()).includes("/v2/")
            ? books
            : rows,
        }),
      ),
    );
    const plan = await scanReadwise(
      new ReadwiseClient("fixture-token", fetcher, 0),
      false,
      signal(),
      vi.fn(),
    );
    expect(plan.sources).toHaveLength(1);
    expect(
      plan.annotations.filter((a) => a.fields["annotation_type"] === "highlight"),
    ).toHaveLength(1);
    expect(plan.sources[0]?.fields["reading"]).toEqual({ status: "archived", progress: 0.5 });
    expect(plan.sources[0]?.fields["tags"]).toEqual(["Reading"]);
    expect(plan.annotations[0]?.body).toBe("> Exact quote\n\nMy note");
    expect(plan.annotations).toHaveLength(1);
    expect(plan.summary.notes).toBe(1);
    expect(object(plan.annotations[0]?.fields["import"])["native_notes"]).toEqual([
      expect.objectContaining({ id: "note" }),
    ]);
    expect(JSON.stringify(plan)).not.toContain("raw_source_url");
    expect(JSON.stringify(plan)).not.toContain("signature=secret");
    const archive = plan.files.find((f) => f.key === "readwise-native");
    expect(archive).toBeDefined();
    expect(await (await archive!.load(signal())).text()).not.toContain("signature=secret");
    expect(object(plan.annotations[0]?.fields["import"])["key"]).toBe("highlight");
    expect(
      fetcher.mock.calls.every(([, options]) => !options?.method || options.method === "GET"),
    ).toBe(true);
  });
});

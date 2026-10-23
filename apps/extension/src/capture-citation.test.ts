// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { prepareCitation, type CitationPreview } from "./capture-citation.js";
import { fakeChrome } from "./testing/fake-chrome.js";

import type { PageCapture } from "./page-capture.js";

const capture: PageCapture = {
  kind: "html",
  submittedUrl: "https://en.wikipedia.org/wiki/Australia",
  canonicalUrl: "https://en.wikipedia.org/wiki/Australia",
  retrievedAt: "2026-10-21T00:00:00.000Z",
  pageTitle: "Australia - Wikipedia",
  html: "<html><head><title>Australia - Wikipedia</title></head><body><h1>Australia</h1></body></html>",
  selection: null,
};
let fake: ReturnType<typeof fakeChrome>;

beforeEach(() => {
  fake = fakeChrome();
  vi.stubGlobal("chrome", fake.chrome);
});

afterEach(() => vi.unstubAllGlobals());

it.each([undefined, false, "true"])(
  "does not fetch Citoid without explicit consent (%s)",
  async (value) => {
    fake.local.set("citoid-enabled", value);
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("No network expected"));
    vi.stubGlobal("fetch", fetcher);
    const preview = await prepareCitation(capture);
    expect(preview?.citation["title"]).toBe("Australia");
    expect(preview?.citation["container-title"]).toBe("Wikipedia");
    expect(preview?.origin).toBe("page");
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it("delivers page evidence before the opted-in lookup upgrades it", async () => {
  fake.local.set("citoid-enabled", true);
  let finish!: (response: Response) => void;
  const fetcher = vi.fn<typeof fetch>().mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const updates: CitationPreview[] = [];
  const pending = prepareCitation(capture, undefined, (preview) => updates.push(preview));
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(updates[0]?.origin).toBe("page");
  finish(
    Response.json([
      {
        itemType: "encyclopediaArticle",
        title: "Australia",
        encyclopediaTitle: "Wikipedia",
        date: "2026-10-20",
        url: capture.canonicalUrl,
      },
    ]),
  );
  const preview = await pending;
  expect(preview?.origin).toBe("citoid");
  expect(preview?.citation.type).toBe("entry-encyclopedia");
  expect(updates.at(-1)?.citation.type).toBe("entry-encyclopedia");
  expect(preview?.provenance["type"]?.source).toBe("site-adapter:citoid/encyclopediaArticle");
  expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe("omit");
});

it("does not read the remote-lookup setting or fetch for social posts and feeds", async () => {
  fake.local.set("citoid-enabled", true);
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
  const post = {
    platform: "x" as const,
    id: "100",
    url: "https://x.com/i/status/100",
    author: { id: "fixture", handle: "fixture", name: "Fixture Author" },
    text: "A post",
    media: [],
  };
  const preview = await prepareCitation({
    ...capture,
    kind: "html",
    post: { ...post, threadRoot: post.id, threadPartial: false, parts: [post] },
  });
  expect(preview?.citation.type).toBe("post");
  expect(preview?.origin).toBe("page");
  expect(
    await prepareCitation({
      ...capture,
      kind: "html",
      social: { mode: "multiple", items: [], nearest: null },
    }),
  ).toBeNull();
  expect(fake.chrome.storage.local.get).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});

it("does not send an aborted capture's address while consent is being read", async () => {
  fake.local.set("citoid-enabled", true);
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  const pending = prepareCitation(capture, controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(fetcher).not.toHaveBeenCalled();
});

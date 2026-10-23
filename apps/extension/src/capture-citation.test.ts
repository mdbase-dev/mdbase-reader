// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { prepareCitation, type CitationPreview } from "./capture-citation.js";
import { fakeChrome } from "./testing/fake-chrome.js";
import { fixture } from "./testing/save-capture-fixture.js";

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

it.each([
  "http://localhost/article",
  "https://foo.localhost/article",
  "https://intranet/article",
  "https://printer.local/article",
  "https://wiki.internal/article",
  "https://router.home.arpa/article",
  "http://10.0.0.1/article",
  "http://172.16.0.1/article",
  "http://192.168.1.1/article",
  "http://127.1/article",
  "http://0x7f000001/article",
  "http://169.254.169.254/article",
  "http://[::1]/article",
  "http://[fc00::1]/article",
  "http://[fe80::1]/article",
  "http://[::ffff:192.168.1.1]/article",
  "https://wiki.local./article",
  "file:///tmp/article",
  "ftp://example.com/article",
  "not a URL",
  "https://person:password@example.com/article",
  "https://person@example.com/article",
  ...[
    "token",
    "key",
    "sig",
    "signature",
    "auth",
    "session",
    "code",
    "password",
    "access_token",
    "apiKey",
    "X-Amz-Signature",
  ].map((key) => `https://example.com/article?${key}=secret`),
])("does not disclose an unsafe address to Citoid: %s", async (url) => {
  fake.local.set("citoid-enabled", true);
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
  const preview = await prepareCitation({ ...capture, canonicalUrl: url, submittedUrl: url });
  expect(preview?.origin).toBe("page");
  expect(fetcher).not.toHaveBeenCalled();
});

it("strips fragments but keeps ordinary query parameters in public Citoid lookups", async () => {
  fake.local.set("citoid-enabled", true);
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));
  vi.stubGlobal("fetch", fetcher);
  const url = "https://example.com/article?chapter=2#private-note";
  await prepareCitation({ ...capture, canonicalUrl: url, submittedUrl: url });
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    `https://en.wikipedia.org/api/rest_v1/data/citation/zotero/${encodeURIComponent("https://example.com/article?chapter=2")}`,
  );
});

it("does not replace an identifier-free PDF filename with a generic Citoid result", async () => {
  fake.local.set("citoid-enabled", true);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json([{ itemType: "webpage", title: "Unrelated webpage" }]));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await prepareCitation({
      kind: "pdf",
      canonicalUrl: "https://example.com/paper.pdf",
      submittedUrl: "https://example.com/paper.pdf",
      pageTitle: "paper.pdf",
      retrievedAt: capture.retrievedAt,
      selection: null,
    }),
  ).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

it("still looks up the DOI of a PDF tab without sending its URL to Citoid", async () => {
  fake.local.set("citoid-enabled", true);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ title: "Registered work" }));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await prepareCitation({
      kind: "pdf",
      canonicalUrl: "https://arxiv.org/pdf/0704.0001",
      submittedUrl: "https://arxiv.org/pdf/0704.0001",
      pageTitle: "0704.0001.pdf",
      retrievedAt: capture.retrievedAt,
      selection: null,
    }),
  ).toMatchObject({ origin: "doi", citation: { title: "Registered work" } });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0]?.[0]).toBe("https://doi.org/10.48550/arXiv.0704.0001");
});

it("persists the page preview's provenance beside its citation on capture save", async () => {
  const preview = await prepareCitation(capture);
  expect(preview).not.toBeNull();
  const f = fixture();
  const saved = await f.save({ highlight: false, title: "Australia" }, capture, {
    citation: preview,
  });
  const source = await f.collection.sources.get(f.collection.collectionId, saved.source.id);
  expect(source?.citation?.["title"]).toBe("Australia");
  expect(source?.cslProvenance).toEqual(preview?.provenance);
  expect(source?.frontmatter["csl-provenance"]).toEqual(preview?.provenance);
  expect(source?.cslProvenance).not.toHaveProperty("id");
});

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
  expect(preview?.provenance["type"]?.source).toBe(
    "site-adapter:citoid/encyclopediaArticle Citoid encyclopediaArticle",
  );
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

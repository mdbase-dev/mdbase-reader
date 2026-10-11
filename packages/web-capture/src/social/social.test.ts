// @vitest-environment happy-dom
import { readFileSync } from "node:fs";

import { normalizedSourceUrl } from "@mdbase-reader/core";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { webCaptureImport } from "../web-capture.js";

import { blueskyPart, mastodonPart, publicJson } from "./api.js";
import { blueskyAdapter } from "./bluesky.js";
import { nearestPost } from "./dom.js";
import { postAddress } from "./identity.js";
import { socialPostImport } from "./import.js";
import { mastodonAdapter } from "./mastodon.js";
import { unrollThread } from "./thread.js";
import { xAdapter } from "./x.js";

import { adapterFor, siteAdapters } from "./index.js";

import type { PostPart } from "@mdbase-reader/core";

function fixture(name: string, url: string): Document {
  window.location.href = url;
  const html = readFileSync(`src/social/fixtures/${name}.html`, "utf8");
  document.documentElement.innerHTML = new DOMParser().parseFromString(
    html,
    "text/html",
  ).documentElement.innerHTML;
  return document;
}

function bskyPost(
  key: string,
  author = "did:plc:fixture",
  parent?: string,
): Record<string, unknown> & { uri: string } {
  return {
    uri: `at://${author}/app.bsky.feed.post/${key}`,
    author: { did: author, handle: "fixture.test", displayName: "Fixture Author" },
    record: {
      text: `Post ${key}`,
      createdAt: "2026-01-01T10:00:00Z",
      ...(parent ? { reply: { parent: { uri: parent } } } : {}),
    },
  };
}

function status(
  id: string,
  uri: string,
  parent?: string,
  author = "fixture",
): Record<string, unknown> {
  return {
    id,
    uri,
    url: uri.replace("/users/fixture/statuses/", "/@fixture/"),
    account: {
      id: author,
      url: `https://home.example/@${author}`,
      acct: `${author}@home.example`,
      display_name: "Fixture Author",
    },
    content: `<p>Post ${id}</p>`,
    created_at: "2026-01-01T10:00:00Z",
    in_reply_to_id: parent ?? null,
    media_attachments: [],
  };
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
}

function requestUrl(input: string | URL | Request): string {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

function mockApi(handler: (url: string) => Response): Mock<typeof fetch> {
  return vi.fn<typeof fetch>((input) => Promise.resolve(handler(requestUrl(input))));
}

beforeEach(() => window.getSelection()?.removeAllRanges());

describe("post identity", () => {
  it.each([
    "https://x.com/fixture/status/100?s=20&t=tracking#photo",
    "https://twitter.com/other/status/100",
    "https://mobile.twitter.com/fixture/status/100/photo/1",
    "https://mobile.x.com/i/web/status/100",
    "https://x.com/i/status/100",
  ])("normalises X variant %s by status ID, not author or tracking", (url) => {
    expect(postAddress(url)).toMatchObject({ id: "100", url: "https://x.com/i/status/100" });
    expect(normalizedSourceUrl(url)).toBe("https://x.com/i/status/100");
  });
  it("keeps an AT URI and DID permalink identical", () => {
    expect(postAddress("at://did:plc:fixture/app.bsky.feed.post/first")).toEqual(
      postAddress("https://bsky.app/profile/did:plc:fixture/post/first?ref=test"),
    );
  });
  it.each([
    "https://x.com/home",
    "https://x.com/fixture/status/100/quotes",
    "https://bsky.app/profile/fixture.test",
    "https://bsky.app/search",
    "https://bad.example/@fixture/no-id",
    "https://x.com.evil.example/fixture/status/100",
    "https://user:secret@x.com/fixture/status/100",
    "http://x.com/fixture/status/100",
  ])("does not make a post identity from %s", (url) => expect(postAddress(url)).toBeNull());
  it("recognises Mastodon address forms without trusting an instance hostname", () => {
    expect(postAddress("https://home.example/users/fixture/statuses/100?ref=test")).toMatchObject({
      platform: "mastodon",
      id: "100",
    });
    expect(postAddress("https://local.example/@fixture@home.example/555")).toMatchObject({
      platform: "mastodon",
      id: "555",
    });
  });
});

describe("saved DOM contracts", () => {
  it.each([
    ["x", "https://x.com/home", xAdapter, 4],
    ["bluesky", "https://bsky.app/profile/fixture.test", blueskyAdapter, 2],
    ["mastodon", "https://local.example/public/local", mastodonAdapter, 2],
  ] as const)(
    "detects, lists and resolves %s loaded posts, not their feed",
    (name, url, adapter, count) => {
      const doc = fixture(name, url);
      expect(adapter.detect(doc)).toBe("multiple");
      expect(adapterFor(doc)).toBe(adapter);
      const refs = adapter.items(doc);
      expect(refs).toHaveLength(count);
      const root = adapter.element(refs[0]!, doc)!;
      expect(adapter.resolve(root.querySelector("time")!)).toEqual(refs[0]);
      expect(adapter.resolve(doc.body)).toBeNull();
      expect(refs[0]?.snippet).toContain("first durable post");
      window.location.href = refs[0]!.url;
      expect(adapter.detect(doc)).toBe("single");
    },
  );
  it("handles Bluesky's expanded item without a self-permalink or postText marker", () => {
    const doc = fixture("bluesky-expanded", "https://bsky.app/profile/fixture.test/post/first");
    const refs = blueskyAdapter.items(doc);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      snippet: "The first durable post.",
      id: "at://fixture.test/app.bsky.feed.post/first",
    });
    expect(blueskyAdapter.resolve(doc.querySelector(".r-1xnzce8")!)).toEqual(refs[0]);
  });
  it("falls through for ordinary sites, including arbitrary numerical paths", () => {
    window.location.href = "https://ordinary.example/@user/100";
    document.body.innerHTML = "<article>An ordinary article</article>";
    document.head.innerHTML = "";
    expect(siteAdapters.every((adapter) => adapter.detect(document) === null)).toBe(true);
  });
  it("extracts X content, media, quoted context and explicit self replies from DOM only", async () => {
    const doc = fixture("x", "https://x.com/home");
    const post = await xAdapter.extract(xAdapter.items(doc)[1]!, doc);
    expect(post.id).toBe("100");
    expect(post.parts.map((part) => part.id)).toEqual(["100", "101"]);
    expect(post.quoted?.text).toContain("Quoted context");
    expect(post.media[0]).toMatchObject({ alt: "A blue square" });
    expect(post.author).toMatchObject({ handle: "fixture", name: "Fixture Author" });
    expect(post.threadPartial).toBe(true);
  });
});

describe("public API adapters", () => {
  it("resolves Bluesky handles to DID identity and unrolls only same-author replies via AppView", async () => {
    const doc = fixture("bluesky", "https://bsky.app/profile/fixture.test");
    const root = bskyPost("first");
    const fetcher = mockApi((url) =>
      url.includes("resolveHandle")
        ? json({ did: "did:plc:fixture" })
        : json({
            thread: {
              post: root,
              replies: [
                { post: bskyPost("second", "did:plc:fixture", root.uri) },
                { post: bskyPost("other", "did:plc:other", root.uri) },
              ],
            },
          }),
    );
    const post = await blueskyAdapter.extract(blueskyAdapter.items(doc)[0]!, doc, {
      fetch: fetcher,
    });
    expect(post.id).toBe(root.uri);
    expect(post.parts.map((part) => part.text)).toEqual(["Post first", "Post second"]);
    expect(post.url).toBe("https://bsky.app/profile/did:plc:fixture/post/first");
    expect(
      fetcher.mock.calls.every(([url]) =>
        requestUrl(url).startsWith("https://public.api.bsky.app/xrpc/"),
      ),
    ).toBe(true);
  });
  it("uses a resolved-DID Bluesky DOM fallback when AppView thread retrieval fails", async () => {
    const doc = fixture("bluesky", "https://bsky.app/profile/fixture.test");
    const fetcher = mockApi((url) =>
      url.includes("resolveHandle")
        ? json({ did: "did:plc:fixture" })
        : new Response("", { status: 503 }),
    );
    const post = await blueskyAdapter.extract(blueskyAdapter.items(doc)[0]!, doc, {
      fetch: fetcher,
    });
    expect(post.id).toBe("at://did:plc:fixture/app.bsky.feed.post/first");
    expect(post.text).toBe("The first durable post.");
    expect(post.threadPartial).toBe(true);
  });
  it("normalises federated Mastodon local IDs and home URI forms to one record", async () => {
    const doc = fixture("mastodon", "https://local.example/public/local");
    const uri = "https://home.example/users/fixture/statuses/100";
    const fetcher = mockApi((url) =>
      url.endsWith("/context")
        ? json({
            ancestors: [],
            descendants: [
              status("556", "https://home.example/users/fixture/statuses/101", "555"),
              status("557", "https://local.example/users/other/statuses/557", "555", "other"),
            ],
          })
        : json(status("555", uri)),
    );
    const post = await mastodonAdapter.extract(mastodonAdapter.items(doc)[0]!, doc, {
      fetch: fetcher,
    });
    expect(post.id).toBe(uri);
    expect(post.url).toBe(uri);
    expect(post.parts.map((part) => part.text)).toEqual(["Post 555", "Post 556"]);
    expect(post.parts[1]?.inReplyTo).toBe(uri);
    expect(
      fetcher.mock.calls.some(
        ([url]) => requestUrl(url) === "https://local.example/api/v1/statuses/555/context",
      ),
    ).toBe(true);
  });
  it("Mastodon DOM fallback requires a home URI rather than guessing from an instance ID", async () => {
    const doc = fixture("mastodon", "https://local.example/public/local");
    const fetcher = mockApi(() => new Response("", { status: 503 }));
    const post = await mastodonAdapter.extract(mastodonAdapter.items(doc)[0]!, doc, {
      fetch: fetcher,
    });
    expect(post.url).toBe("https://home.example/users/fixture/statuses/100");
    await expect(
      mastodonAdapter.extract(mastodonAdapter.items(doc)[1]!, doc, { fetch: fetcher }),
    ).rejects.toThrow("HTTP 503");
  });
});

describe("Mastodon anonymous profile placeholders", () => {
  it("maps only loaded placeholders to official status identities; unseen API posts are not picker items", async () => {
    const doc = fixture("mastodon", "https://local.example/@fixture");
    doc.body.innerHTML =
      '<div id="mastodon"><div class="status__wrapper"><span>Fixture Author</span><span>&lt;p&gt;Post 555&lt;/p&gt;</span></div></div>';
    const known = status("555", "https://home.example/users/fixture/statuses/100");
    const fetcher = mockApi((url) =>
      url.includes("accounts/lookup")
        ? json({ id: "20" })
        : json([known, status("777", "https://home.example/users/fixture/statuses/777")]),
    );
    expect(mastodonAdapter.items(doc)).toHaveLength(0);
    await mastodonAdapter.prepare(doc, { fetch: fetcher });
    const items = mastodonAdapter.items(doc);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "555",
      snippet: "Post 555",
      author: "fixture@home.example",
    });
    expect(mastodonAdapter.resolve(doc.querySelector("span")!)?.id).toBe("555");
  });
  it("does not guess when two API statuses have the same author and text", async () => {
    const doc = fixture("mastodon", "https://local.example/@fixture");
    doc.body.innerHTML =
      '<div id="mastodon"><div class="status__wrapper"><span>Fixture Author</span><span>&lt;p&gt;Post 555&lt;/p&gt;</span></div></div>';
    const first = status("555", "https://home.example/users/fixture/statuses/100");
    const fetcher = mockApi((url) =>
      url.includes("accounts/lookup") ? json({ id: "20" }) : json([first, { ...first, id: "556" }]),
    );
    await mastodonAdapter.prepare(doc, { fetch: fetcher });
    expect(mastodonAdapter.items(doc)).toHaveLength(0);
  });
});

const part = (id: string, author: string, parent?: string): PostPart => ({
  platform: "x",
  id,
  url: `https://x.com/i/status/${id}`,
  text: `Part ${id}`,
  author: { id: author, handle: author, name: author },
  media: [],
  ...(parent ? { inReplyTo: parent } : {}),
});

describe("threads and picker", () => {
  it("unrolls ancestors and self-reply branches but excludes other authors and unrelated posts", () => {
    const root = part("1", "author");
    const middle = part("2", "author", "1");
    expect(
      unrollThread(
        middle,
        [root, middle, part("3", "author", "2"), part("4", "other", "2"), part("5", "author")],
        false,
      ).parts.map((item) => item.id),
    ).toEqual(["1", "2", "3"]);
  });
  it("terminates cyclic reply graphs", () => {
    expect(unrollThread(part("1", "a", "2"), [part("2", "a", "1")], true).parts).toHaveLength(2);
  });
  it("preselects the visible post closest to viewport centre", () => {
    const refs = xAdapter.items(fixture("x", "https://x.com/home"));
    expect(
      nearestPost(
        refs.map((ref, index) => ({ ...ref, top: index * 300 - 100, bottom: index * 300 + 100 })),
        800,
      ),
    ).toBe("101");
    expect(nearestPost([], 800)).toBeNull();
  });
  it("embeds Bluesky quoted-post context from official embed data", () => {
    const quoted = { ...bskyPost("quoted", "did:plc:quoted"), value: { text: "Quoted context" } };
    const post = blueskyPart({ ...bskyPost("first"), embed: { record: quoted } });
    expect(post.quoted?.text).toBe("Quoted context");
  });
});

describe("portable post imports and capture safety", () => {
  it("does not mistake another site's generic initial-state script for a Mastodon page", () => {
    const parsed = new DOMParser().parseFromString(
      '<script id="initial-state" type="application/json">{"app":"ordinary"}</script><article>Ordinary article</article>',
      "text/html",
    );
    expect(mastodonAdapter.detect(parsed, "https://ordinary-site.test/@fixture/123")).toBeNull();
    expect(adapterFor(parsed, "https://ordinary-site.test/article")).toBeNull();
  });
  it("retains Mastodon audio attachment URLs/types without pretending to archive playback", async () => {
    const root = mastodonPart(
      {
        uri: "https://any-instance.test/users/fixture/statuses/100",
        content: "<p>Audio note</p>",
        account: {
          url: "https://any-instance.test/@fixture",
          acct: "fixture",
          display_name: "Fixture Author",
        },
        media_attachments: [
          { type: "audio", url: "https://media.example/note.mp3", description: "" },
        ],
      },
      document,
    );
    expect(root.media[0]?.kind).toBe("audio");
    const prepared = await socialPostImport(unrollThread(root, [], false), {
      retrievedAt: "2026-01-01T10:00:00Z",
    });
    expect(new TextDecoder().decode(prepared.bytes)).toContain(
      "Audio (original URL retained in source metadata)",
    );
    expect(prepared.metadata.socialPost?.media[0]?.url).toBe("https://media.example/note.mp3");
  });
  it("stores safe readable HTML, a post-only archive and portable metadata with offline images", async () => {
    const root = {
      ...part("1", "author"),
      text: '<script>alert("not executable")</script>',
      media: [
        { kind: "image" as const, url: "https://media.example/one.png", alt: "A blue square" },
      ],
    };
    const prepared = await socialPostImport(
      unrollThread(root, [], false),
      { retrievedAt: "2026-01-01T10:00:00Z" },
      {
        fetch: mockApi(
          () =>
            new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }),
        ),
      },
    );
    const readable = new TextDecoder().decode(prepared.bytes);
    expect(readable).toContain("data:image/png;base64,");
    expect(readable).not.toContain("<script>");
    expect(new TextDecoder().decode(prepared.archive.bytes)).not.toContain("Not a source");
    expect(prepared.metadata.socialPost?.media[0]?.url).toBe("https://media.example/one.png");
    expect(prepared.scholarly.citation?.type).toBe("post");
  });
  it("rejects feed imports before the generic extractor can save snapshots", async () => {
    const doc = fixture("x", "https://x.com/home");
    await expect(
      webCaptureImport(
        {
          submittedUrl: doc.location.href,
          canonicalUrl: doc.location.href,
          retrievedAt: "2026-01-01T10:00:00Z",
          html: doc.documentElement.outerHTML,
        },
        { document: doc },
      ),
    ).rejects.toThrow("Feeds cannot be saved");
  });
  it("makes only bounded, no-auth public API requests", async () => {
    const fetcher = mockApi(() => json({ ok: true }));
    await publicJson("https://public.api.bsky.app/xrpc/test", { fetch: fetcher });
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: "omit", redirect: "error" }),
    );
    await expect(
      publicJson("https://public.api.bsky.app/xrpc/test", {
        fetch: mockApi(() => new Response("x".repeat(2 * 1024 * 1024 + 1))),
      }),
    ).rejects.toThrow("too large");
  });
});

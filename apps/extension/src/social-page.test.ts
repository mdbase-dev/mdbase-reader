// @vitest-environment happy-dom
import { readFileSync } from "node:fs";

import { matchTextQuote } from "@mdbase-reader/core";
import { siteAdapters } from "@mdbase-reader/web-capture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pageText } from "./page-annotations.js";
import { createSocialPageBridge, selectedPost } from "./social-page.js";
import { scopePostQuotes } from "./social-quotes.js";

const registry = new Map<string, Set<Range>>();

beforeEach(() => {
  window.location.href = "https://x.com/home";
  document.documentElement.innerHTML = new DOMParser().parseFromString(
    readFileSync("../../packages/web-capture/src/social/fixtures/x.html", "utf8"),
    "text/html",
  ).documentElement.innerHTML;
  window.getSelection()?.removeAllRanges();
  registry.clear();
  vi.stubGlobal(
    "Highlight",
    class extends Set<Range> {
      constructor(...ranges: Range[]) {
        super(ranges);
      }
    },
  );
  Object.defineProperty(window, "CSS", { value: { highlights: registry }, configurable: true });
});
afterEach(() => vi.unstubAllGlobals());

function select(start: Node, end: Node = start): void {
  const range = document.createRange();
  range.setStart(start, 0);
  range.setEnd(end, end.textContent?.length ?? 0);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
}

describe("post-by-post live capture and annotation projection", () => {
  it("does not snapshot or identify a feed as a source", async () => {
    const capture = await createSocialPageBridge(document).capture();
    expect(capture).toMatchObject({ social: { mode: "multiple" }, html: "", selection: null });
    expect(capture?.post).toBeUndefined();
  });
  it("resolves a feed selection to its post and anchors it to the unrolled readable text", async () => {
    const texts = document.querySelectorAll('[data-testid="tweetText"]');
    const second = texts[2]!.firstChild!;
    select(second);
    const bridge = createSocialPageBridge(document);
    expect(selectedPost(document, siteAdapters[0])?.id).toBe("101");
    const capture = await bridge.capture();
    expect(capture?.canonicalUrl).toBe("https://x.com/i/status/100");
    expect(capture?.selection?.exact).toBe("The second durable post.");
    const parsed = new DOMParser().parseFromString(capture!.html, "text/html");
    expect(
      matchTextQuote(pageText({ action: "text" }, parsed).text ?? "", capture!.selection!),
    ).toMatchObject({ ambiguous: false });
    expect(capture?.html).not.toContain("Someone else's reply");
    expect(capture?.html).not.toContain("Not a source");
    expect(capture?.pageUrl).toBe("https://x.com/home");
  });
  it("does not resolve selections that cross two posts", () => {
    const texts = document.querySelectorAll('[data-testid="tweetText"]');
    select(texts[0]!.firstChild!, texts[2]!.firstChild!);
    expect(selectedPost(document, siteAdapters[0])).toBeNull();
  });
  it("saves only the chosen loaded post, with no network call for X", async () => {
    const fetcher = vi.fn(() => Promise.reject(new Error("No X network API allowed")));
    vi.stubGlobal("fetch", fetcher);
    const capture = await createSocialPageBridge(document).capture("103");
    expect(capture?.post?.parts).toHaveLength(1);
    expect(capture?.post?.id).toBe("103");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("never redraws a saved quote in a neighbouring post with identical text", () => {
    const texts = document.querySelectorAll('[data-testid="tweetText"]');
    texts[0]!.textContent = "Same durable quotation.";
    texts[2]!.textContent = "Same durable quotation.";
    const bridge = createSocialPageBridge(document);
    const projection = bridge.draw(
      [{ exact: "Same durable quotation.", postUrl: "https://x.com/i/status/101" }],
      window.location.href,
    );
    expect(projection.report).toMatchObject({ shown: 1, ambiguous: 0 });
    const range = [...registry.values()][0]?.values().next().value;
    expect(range?.startContainer.parentElement).toBe(texts[2]);
  });
  it("scopes annotations on thread parts and redraws after DOM replacement", async () => {
    const bridge = createSocialPageBridge(document);
    const capture = await bridge.capture("100");
    const quotes = scopePostQuotes(
      [{ exact: "The second durable post.", postId: "101" }],
      capture?.post,
    );
    expect(quotes[0]?.postUrl).toBe("https://x.com/i/status/101");
    expect(bridge.draw(quotes, window.location.href).report.shown).toBe(1);
    const root = document.querySelectorAll('article[data-testid="tweet"]')[1]!;
    root.replaceWith(root.cloneNode(true));
    expect(bridge.draw(quotes, window.location.href).report.shown).toBe(1);
    expect([...registry.values()][0]?.values().next().value?.startContainer.isConnected).toBe(true);
  });
  it("does not guess which thread part owns an identical quote without explicit part evidence", async () => {
    const bridge = createSocialPageBridge(document);
    const capture = await bridge.capture("100");
    const post = {
      ...capture!.post!,
      parts: capture!.post!.parts.map((part) => ({ ...part, text: "Identical passage" })),
    };
    expect(scopePostQuotes([{ exact: "Identical passage" }], post)[0]?.postUrl).toContain(
      "unresolved-post",
    );
    expect(scopePostQuotes([{ exact: "Identical passage", postId: "101" }], post)[0]?.postUrl).toBe(
      "https://x.com/i/status/101",
    );
  });

  it("resolves an unmarked quote only when the source is a single post", () => {
    const part = { id: "100", url: "https://x.com/i/status/100" };
    const post = {
      platform: "x" as const,
      ...part,
      author: { id: "fixture", handle: "fixture", name: "Fixture Author" },
      threadRoot: "100",
      threadPartial: true,
      parts: [{ ...part, quoted: { id: "900", url: "https://x.com/i/status/900" } }],
    };
    expect(scopePostQuotes([{ exact: "Anything" }], post)[0]?.postUrl).toBe(part.url);
    // A quoted post is drawn inside the post quoting it.
    expect(scopePostQuotes([{ exact: "Quoted", postId: "900" }], post)[0]?.postUrl).toBe(part.url);
    const thread = { ...post, parts: [part, { id: "101", url: "https://x.com/i/status/101" }] };
    expect(scopePostQuotes([{ exact: "Anything" }], thread)[0]?.postUrl).toContain(
      "unresolved-post",
    );
  });

  it("preselects the middle post, not the first loaded post", () => {
    [...document.querySelectorAll('article[data-testid="tweet"]')].forEach((element, index) => {
      vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
        top: index * 200,
        bottom: index * 200 + 150,
      } as DOMRect);
    });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    expect(createSocialPageBridge(document).items()?.nearest).toBe("102");
  });
});

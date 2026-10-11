import { postAddress, type PostAddress } from "./identity.js";

import type { PostMedia, PostPart, SocialPlatform } from "@mdbase-reader/core";

export interface PostRef {
  readonly platform: SocialPlatform;
  readonly id: string;
  readonly url: string;
  readonly sourceUrl?: string;
  readonly author: string;
  readonly snippet: string;
  readonly published?: string;
  readonly top: number;
  readonly bottom: number;
}

export interface DomSelectors {
  readonly post: string;
  readonly content: string;
  readonly permalink: string;
  readonly author: string;
  readonly name: string;
  readonly quote: string;
  readonly media: string;
}

export function refFor(
  element: Element,
  platform: SocialPlatform,
  selectors: DomSelectors,
): PostRef | null {
  const address = elementAddress(element, platform, selectors);
  if (address?.platform !== platform) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  const published =
    element.querySelector("time")?.getAttribute("datetime") ??
    element.getAttribute("data-reader-post-published");
  return {
    platform,
    id: address.id,
    url: address.url,
    author:
      element.querySelector(selectors.author)?.textContent.trim() ??
      element.getAttribute("data-reader-post-author") ??
      "",
    snippet: (
      element.querySelector(selectors.content)?.textContent.trim() ??
      element.getAttribute("data-reader-post-text") ??
      ""
    ).slice(0, 180),
    ...(published ? { published } : {}),
    top: rect.top,
    bottom: rect.bottom,
  };
}

function elementAddress(
  element: Element,
  platform: SocialPlatform,
  selectors: DomSelectors,
): PostAddress | null {
  const href =
    element.querySelector(selectors.permalink)?.getAttribute("href") ??
    element.getAttribute("data-reader-post-url");
  if (!href) {
    return null;
  }
  const doc = element.ownerDocument;
  const fallback =
    platform === "bluesky"
      ? "https://bsky.app"
      : platform === "x"
        ? "https://x.com"
        : "https://example.invalid";
  const base = doc.URL.startsWith("https://")
    ? doc.URL
    : (doc.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content ?? fallback);
  try {
    return postAddress(new URL(href, base).href);
  } catch {
    return null;
  }
}

export function domPart(
  element: Element,
  ref: PostRef,
  selectors: DomSelectors,
  depth = 0,
): PostPart {
  const quoteElement = element.querySelector(selectors.quote);
  const quotedRef =
    quoteElement && depth === 0 ? refFor(quoteElement, ref.platform, selectors) : null;
  const reply = element.getAttribute("data-in-reply-to");
  return {
    platform: ref.platform,
    id: ref.id,
    url: ref.url,
    author: domAuthor(element, ref, selectors),
    ...(ref.published ? { published: ref.published } : {}),
    text:
      element.querySelector(selectors.content)?.textContent.trim() ??
      element.getAttribute("data-reader-post-text") ??
      "",
    media: domMedia(element, selectors, quoteElement),
    ...(quotedRef && quoteElement
      ? { quoted: domPart(quoteElement, quotedRef, selectors, 1) }
      : {}),
    ...(reply ? { inReplyTo: reply } : {}),
  };
}

function domAuthor(element: Element, ref: PostRef, selectors: DomSelectors): PostPart["author"] {
  const node = element.querySelector(selectors.author);
  const link = node?.closest("a") ?? node?.querySelector("a");
  const href = link?.getAttribute("href");
  const handle =
    ref.platform === "mastodon"
      ? (node?.textContent.trim() ?? ref.author).replace(/^@/u, "")
      : (href?.split("/").filter(Boolean).at(-1) ?? ref.author);
  return {
    id: href ?? handle,
    handle,
    name: element.querySelector(selectors.name)?.textContent.trim() ?? ref.author,
  };
}

function domMedia(element: Element, selectors: DomSelectors, quote: Element | null): PostMedia[] {
  return [...element.querySelectorAll(selectors.media)]
    .filter((node) => !quote?.contains(node))
    .flatMap((node) => {
      const source = node.getAttribute("src") ?? node.querySelector("source")?.getAttribute("src");
      const video = node.tagName === "VIDEO";
      const poster = video ? node.getAttribute("poster") : null;
      const url = source?.startsWith("https://") ? source : poster;
      if (!url?.startsWith("https://")) {
        return [];
      }
      const kind = video && url === source ? ("video" as const) : ("image" as const);
      const alt =
        node.getAttribute("alt") ??
        node.getAttribute("aria-label") ??
        (poster ? "Video poster" : "");
      return [{ url, alt, kind }];
    });
}

export function nearestPost(items: readonly PostRef[], viewportHeight: number): string | null {
  const middle = viewportHeight / 2;
  return (
    [...items]
      .filter((item) => item.bottom > 0 && item.top < viewportHeight)
      .sort(
        (a, b) =>
          Math.abs((a.top + a.bottom) / 2 - middle) - Math.abs((b.top + b.bottom) / 2 - middle),
      )[0]?.id ??
    items[0]?.id ??
    null
  );
}

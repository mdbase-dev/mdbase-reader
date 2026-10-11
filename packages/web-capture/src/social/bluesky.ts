import {
  array,
  blueskyIdentity,
  blueskyPart,
  publicJson,
  record,
  type SocialFetchOptions,
} from "./api.js";
import { refFor, type DomSelectors, type PostRef } from "./dom.js";
import { postAddress } from "./identity.js";
import { domAdapter, domFallback } from "./registry.js";
import { unrollThread } from "./thread.js";

import type { PostPart } from "@mdbase-reader/core";

export const blueskySelectors: DomSelectors = {
  post: '[data-testid^="feedItem-by-"], [data-testid="postThreadItem"], [data-testid^="postThreadItem-by-"]',
  content: '[data-testid="postText"], div[dir="auto"].r-1xnzce8',
  permalink:
    'a[href*="/post/"]:not([data-testid="quotePost"] a):not([href$="/reposted-by"]):not([href$="/quotes"]):not([href$="/liked-by"])',
  author:
    'a[href*="/profile/"]:not([href*="/post/"]):has([dir="auto"]), a[data-testid="profileDisplayName"]',
  name: '[data-testid="profileDisplayName"], a[href*="/profile/"]:not([href*="/post/"]) [dir="auto"]',
  quote: '[data-testid="quotePost"]',
  media: '[data-testid="postImages"] img, img[alt]:not([data-testid="userAvatarImage"] img), video',
};

export const blueskyAdapter = domAdapter(
  "bluesky",
  (value) => {
    try {
      return new URL(value).hostname === "bsky.app";
    } catch {
      return false;
    }
  },
  () => false,
  blueskySelectors,
  async (ref, document, options = {}) => {
    try {
      return await blueskyThread(ref.url, options);
    } catch (reason) {
      options.signal?.throwIfAborted();
      const fallback = domFallback(blueskyAdapter, ref, document, blueskySelectors);
      // A handle is not an identity. Even the DOM fallback must resolve it to a DID.
      const provisional = postAddress(ref.url);
      if (!provisional) {
        throw reason;
      }
      const address = await blueskyIdentity(provisional, options);
      const part = {
        ...fallback,
        id: address.id,
        url: address.url,
        author: { ...fallback.author, id: address.id.split("/")[2] ?? "" },
      };
      if (!part.text) {
        throw reason;
      }
      return unrollThread(part, [], true);
    }
  },
  (ref, options = {}) => {
    const address = postAddress(ref.url);
    if (!address) {
      throw new Error("Invalid Bluesky post URL.");
    }
    return blueskyIdentity(address, options);
  },
  blueskyRef,
);

function blueskyRef(element: Element): PostRef | null {
  const ordinary = refFor(element, "bluesky", blueskySelectors);
  if (ordinary) {
    return ordinary;
  }
  // The expanded post links only to its statistics, not back to its own permalink.
  if (!element.querySelector('[data-testid="repostCount-expanded"]')) {
    return null;
  }
  const address = postAddress(element.ownerDocument.URL);
  if (address?.platform !== "bluesky") {
    return null;
  }
  const rect = element.getBoundingClientRect();
  return {
    ...address,
    author: element.querySelector(blueskySelectors.name)?.textContent.trim() ?? "",
    snippet:
      element.querySelector(blueskySelectors.content)?.textContent.trim().slice(0, 180) ?? "",
    top: rect.top,
    bottom: rect.bottom,
  };
}

export async function blueskyThread(
  url: string,
  options: SocialFetchOptions,
  rootFetched = false,
): Promise<ReturnType<typeof unrollThread>> {
  const address = postAddress(url);
  if (address?.platform !== "bluesky") {
    throw new Error("Not a Bluesky post URL.");
  }
  const identity = await blueskyIdentity(address, options);
  const result = record(
    await publicJson(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(identity.id)}&depth=100&parentHeight=100`,
      options,
    ),
  );
  const thread = record(result["thread"]);
  const selected = blueskyPart(thread["post"]);
  const parts: PostPart[] = [];
  let partial = false;
  const visit = (value: unknown, depth: number): void => {
    const node = record(value);
    if (!node["post"] || depth > 100) {
      partial = true;
      return;
    }
    const part = blueskyPart(node["post"]);
    if (parts.some((item) => item.id === part.id)) {
      return;
    }
    parts.push(part);
    if (node["parent"]) {
      visit(node["parent"], depth + 1);
    }
    for (const reply of array(node["replies"])) {
      const author = record(record(record(reply)["post"])["author"]);
      if (author["did"] === selected.author.id) {
        visit(reply, depth + 1);
      }
    }
    if (depth === 100) {
      partial = true;
    }
  };
  visit(thread, 0);
  const unrolled = unrollThread(selected, parts, partial);
  if (unrolled.id !== selected.id && !rootFetched) {
    return blueskyThread(unrolled.url, options, true).catch(() => {
      options.signal?.throwIfAborted();
      return { ...unrolled, threadPartial: true };
    });
  }
  return unrolled;
}

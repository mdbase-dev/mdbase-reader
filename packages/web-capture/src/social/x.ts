import { domPart, type DomSelectors } from "./dom.js";
import { postAddress } from "./identity.js";
import { domAdapter } from "./registry.js";
import { unrollThread } from "./thread.js";

import type { PostPart } from "@mdbase-reader/core";

/** All X layout assumptions live here. No undocumented or third-party endpoints. */
export const xSelectors: DomSelectors = {
  post: 'article[data-testid="tweet"]',
  content: '[data-testid="tweetText"]',
  permalink: 'a[href*="/status/"]:has(time)',
  author: '[data-testid="User-Name"] a[href]:first-child',
  name: '[data-testid="User-Name"] a:first-child',
  quote: '[role="link"][tabindex="0"]:has([data-testid="tweetText"])',
  media: '[data-testid="tweetPhoto"] img, video',
};

export const xAdapter = domAdapter(
  "x",
  (value) => {
    try {
      return /^(?:(?:www|mobile)\.)?(?:x|twitter)\.com$/u.test(new URL(value).hostname);
    } catch {
      return false;
    }
  },
  () => false,
  xSelectors,
  (ref, document) => {
    const parts = xAdapter
      .entries(document)
      .map((entry) => domPart(entry.element, entry.ref, xSelectors));
    const pagePost = postAddress(document.URL);
    const linked = pagePost?.platform === "x" ? conversationThread(parts, pagePost.id) : parts;
    const selected = linked.find((part) => part.id === ref.id);
    if (!selected) {
      throw new Error("X posts must be saved from a loaded post in the Reader extension.");
    }
    // X never shows every reply, so its threads are always marked partial.
    return Promise.resolve(unrollThread(selected, linked, true));
  },
);

/**
 * X's markup has no reply edges. On a conversation page, the author's own thread is the run
 * of their posts directly around the focal post: earlier parts above it, later parts below,
 * before anyone else's reply. Feeds never get these edges, so unrelated posts never join.
 */
export function conversationThread(parts: readonly PostPart[], focalId: string): PostPart[] {
  const focal = parts.findIndex((part) => part.id === focalId);
  const author = parts[focal]?.author.id;
  if (author === undefined) {
    return [...parts];
  }
  let first = focal;
  while (parts[first - 1]?.author.id === author) {
    first -= 1;
  }
  let last = focal;
  while (parts[last + 1]?.author.id === author) {
    last += 1;
  }
  return parts.map((part, index) => {
    const previous = parts[index - 1];
    return previous && index > first && index <= last && !part.inReplyTo
      ? { ...part, inReplyTo: previous.id }
      : part;
  });
}

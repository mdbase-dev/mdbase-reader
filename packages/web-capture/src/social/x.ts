import { domPart, type DomSelectors } from "./dom.js";
import { postAddress } from "./identity.js";
import { domAdapter } from "./registry.js";
import { unrollThread } from "./thread.js";

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
    const element = xAdapter.element(ref, document);
    if (!element) {
      throw new Error("X posts must be saved from a loaded post in the Reader extension.");
    }
    const selected = domPart(element, ref, xSelectors);
    const parts = xAdapter.items(document).flatMap((item) => {
      const node = xAdapter.element(item, document);
      return node ? [domPart(node, item, xSelectors)] : [];
    });
    // On a conversation page X omits machine-readable reply edges. Its visible reply label
    // is usable only in that conversation, never to join unrelated posts on a feed.
    const pagePost = postAddress(document.URL);
    if (pagePost?.platform === "x") {
      let previous = parts.find((part) => part.id === pagePost.id);
      for (const [index, part] of parts.entries()) {
        if (!previous || part.id === previous.id || part.inReplyTo) {
          continue;
        }
        const item = xAdapter.items(document)[index];
        const node = item ? xAdapter.element(item, document) : null;
        const handle = previous.author.handle;
        const replyLabel = node?.querySelector('[data-testid="replyingTo"]')?.textContent ?? "";
        if (part.author.id === previous.author.id && replyLabel.includes(`@${handle}`)) {
          parts[index] = { ...part, inReplyTo: previous.id };
          previous = parts[index];
        }
      }
    }
    return Promise.resolve(
      unrollThread(parts.find((part) => part.id === selected.id) ?? selected, parts, true),
    );
  },
);

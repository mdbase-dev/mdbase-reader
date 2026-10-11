import { blueskyAdapter, blueskyThread } from "./bluesky.js";
import { postAddress } from "./identity.js";
import { mastodonAdapter, mastodonThread } from "./mastodon.js";
import { xAdapter } from "./x.js";

import type { SocialFetchOptions } from "./api.js";
import type { SiteAdapter } from "./registry.js";
import type { SocialPost } from "@mdbase-reader/core";

export { postAddress } from "./identity.js";
export { nearestPost } from "./dom.js";
export { unrollThread } from "./thread.js";
export type { PostRef } from "./dom.js";
export type { SiteAdapter, PostDetection } from "./registry.js";
export type { SocialFetchOptions } from "./api.js";

export const siteAdapters = [xAdapter, blueskyAdapter, mastodonAdapter] as const;

export function adapterFor(document: Document, url = document.URL): SiteAdapter | null {
  return siteAdapters.find((adapter) => adapter.detect(document, url) !== null) ?? null;
}

/** A URL-only Mastodon probe is confirmed by the status API, not assumed from its host. */
export function postFromUrl(
  url: string,
  document: Document,
  options: SocialFetchOptions = {},
): Promise<SocialPost | null> {
  const address = postAddress(url);
  if (!address) {
    return Promise.resolve(null);
  }
  if (address.platform === "x") {
    throw new Error(
      "Save X posts from their live page using the mdbase Reader extension. Reader cannot retrieve X posts without that page.",
    );
  }
  if (address.platform === "bluesky") {
    return blueskyThread(url, options);
  }
  return mastodonThread(url, document, options);
}

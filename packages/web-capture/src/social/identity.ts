import type { SocialPlatform } from "@mdbase-reader/core";

export interface PostAddress {
  readonly platform: SocialPlatform;
  readonly id: string;
  readonly url: string;
  readonly host: string;
}

/** Handle and federated-instance addresses are provisional until resolved by the API. */
export function postAddress(value: string): PostAddress | null {
  try {
    if (value.startsWith("at://")) {
      return atAddress(value);
    }
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) {
      return null;
    }
    const host = url.hostname.toLowerCase();
    if (/^(?:(?:www|mobile)\.)?(?:x|twitter)\.com$/u.test(host)) {
      const id =
        /^\/(?:[^/]+\/status|i\/web\/status|i\/status)\/(\d+)(?:\/(?:photo|video)\/\d+)?\/?$/u.exec(
          url.pathname,
        )?.[1];
      return id ? { platform: "x", id, url: `https://x.com/i/status/${id}`, host: "x.com" } : null;
    }
    if (host === "bsky.app") {
      const match = /^\/profile\/([^/]+)\/post\/([^/]+)\/?$/u.exec(url.pathname);
      return match?.[1] && match[2] ? blueskyAddress(decodeURIComponent(match[1]), match[2]) : null;
    }
    const id = /^\/(?:@[^/]+|users\/[^/]+\/statuses)\/(\d+)\/?$/u.exec(url.pathname)?.[1];
    return id
      ? { platform: "mastodon", id, url: `${url.origin}${url.pathname.replace(/\/$/u, "")}`, host }
      : null;
  } catch {
    return null;
  }
}

function atAddress(value: string): PostAddress | null {
  const match = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/?#]+)$/u.exec(value);
  return match?.[1] && match[2] ? blueskyAddress(match[1], match[2]) : null;
}

function blueskyAddress(actor: string, key: string): PostAddress {
  return {
    platform: "bluesky",
    id: `at://${actor}/app.bsky.feed.post/${key}`,
    url: `https://bsky.app/profile/${actor}/post/${key}`,
    host: "bsky.app",
  };
}

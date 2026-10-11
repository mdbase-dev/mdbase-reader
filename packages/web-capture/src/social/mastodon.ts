import { array, mastodonPart, publicJson, record, text, type SocialFetchOptions } from "./api.js";
import { postAddress } from "./identity.js";
import { prepareMastodonProfile } from "./mastodon-profile.js";
import { domAdapter, domFallback } from "./registry.js";
import { unrollThread } from "./thread.js";

import type { DomSelectors } from "./dom.js";

export const mastodonSelectors: DomSelectors = {
  post: ".status, .detailed-status, .entry:has(.status__content), .status__wrapper[data-reader-post-url]",
  content: ".status__content, .e-content",
  permalink: "a.status__relative-time, a.detailed-status__datetime, a.u-url",
  author: ".display-name__account, a.status__display-name",
  name: ".display-name__html",
  quote: ".quoted-status, .status__quote",
  media: ".media-gallery img, .attachment-list img, .video-player video",
};

export function mastodonMarker(document: Document): boolean {
  return Boolean(
    document.querySelector(
      'meta[name="application-name"][content="Mastodon"], #mastodon, .mastodon, .detailed-status, .status__content, script#initial-state',
    ),
  );
}

export const mastodonAdapter = domAdapter(
  "mastodon",
  () => false,
  mastodonMarker,
  mastodonSelectors,
  async (ref, document, options = {}) => {
    try {
      return await mastodonThread(ref.url, document, options);
    } catch (reason) {
      options.signal?.throwIfAborted();
      // Do not guess a remote status's identity from a local instance's numerical ID.
      const fallback = domFallback(mastodonAdapter, ref, document, mastodonSelectors);
      const element = mastodonAdapter.element(ref, document);
      const uri =
        element?.getAttribute("data-uri") ??
        element?.querySelector<HTMLAnchorElement>('a[rel="original"]')?.href;
      if (!uri?.startsWith("https://")) {
        throw reason;
      }
      const part = { ...fallback, id: uri, url: uri };
      return unrollThread(part, [], true);
    }
  },
  async (ref, options = {}) => {
    const address = postAddress(ref.url);
    if (!address) {
      throw new Error("Invalid Mastodon post URL.");
    }
    const status = record(
      await publicJson(`https://${address.host}/api/v1/statuses/${address.id}`, options),
    );
    const uri = text(status["uri"]);
    if (!uri.startsWith("https://")) {
      throw new Error("Invalid Mastodon identity.");
    }
    return { id: uri, url: uri };
  },
);

mastodonAdapter.prepare = prepareMastodonProfile;

export async function mastodonThread(
  url: string,
  document: Document,
  options: SocialFetchOptions,
  rootFetched = false,
): Promise<ReturnType<typeof unrollThread>> {
  const address = postAddress(url);
  if (address?.platform !== "mastodon") {
    throw new Error("Not a Mastodon status URL.");
  }
  const origin = new URL(url).origin;
  const status = record(await publicJson(`${origin}/api/v1/statuses/${address.id}`, options));
  const selected = mastodonPart(status, document);
  const completeness = { partial: false };
  const context = await publicJson(
    `${origin}/api/v1/statuses/${address.id}/context`,
    options,
  ).catch(() => {
    options.signal?.throwIfAborted();
    completeness.partial = true;
    return {};
  });
  const statuses = [
    status,
    ...array(record(context)["ancestors"]),
    ...array(record(context)["descendants"]),
  ].map(record);
  const identities = new Map(statuses.map((item) => [text(item["id"]), text(item["uri"])]));
  const parts = statuses.map((item) => {
    const part = mastodonPart(item, document);
    return {
      ...part,
      ...(part.inReplyTo ? { inReplyTo: identities.get(part.inReplyTo) ?? part.inReplyTo } : {}),
    };
  });
  // Mastodon's context endpoint can be server-capped. Preserve this uncertainty.
  const unrolled = unrollThread(
    parts.find((part) => part.id === selected.id) ?? selected,
    parts,
    completeness.partial || statuses.length >= 60,
  );
  if (unrolled.id !== selected.id && !rootFetched) {
    return mastodonThread(unrolled.url, document, options, true).catch(() => {
      options.signal?.throwIfAborted();
      return { ...unrolled, threadPartial: true };
    });
  }
  return unrolled;
}

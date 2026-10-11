import { domPart, refFor, type DomSelectors, type PostRef } from "./dom.js";
import { postAddress } from "./identity.js";
import { unrollThread } from "./thread.js";

import type { SocialFetchOptions } from "./api.js";
import type { SocialPost } from "@mdbase-reader/core";

export type PostDetection = "single" | "multiple" | null;

/** A loaded post and its element, found in one pass over the page. */
export interface PostEntry {
  readonly ref: PostRef;
  readonly element: Element;
}

export interface SiteAdapter {
  readonly id: PostRef["platform"];
  matches(url: string): boolean;
  prepare(document: Document, options?: SocialFetchOptions): Promise<void>;
  identity(ref: PostRef, options?: SocialFetchOptions): Promise<{ id: string; url: string }>;
  detect(document: Document, url?: string): PostDetection;
  /** Every loaded post with its element. Prefer this to `items` plus `element` per post. */
  entries(document: Document): PostEntry[];
  items(document: Document): PostRef[];
  resolve(element: Element): PostRef | null;
  element(ref: PostRef, document: Document): Element | null;
  extract(ref: PostRef, document: Document, options?: SocialFetchOptions): Promise<SocialPost>;
}

export function domAdapter(
  id: SiteAdapter["id"],
  matches: SiteAdapter["matches"],
  marker: (document: Document) => boolean,
  selectors: DomSelectors,
  extract?: SiteAdapter["extract"],
  identity?: SiteAdapter["identity"],
  refOf: (element: Element) => PostRef | null = (element) => refFor(element, id, selectors),
): SiteAdapter {
  const entries = (document: Document): PostEntry[] => {
    const seen = new Set<string>();
    return [...document.querySelectorAll(selectors.post)].flatMap((element) => {
      const ref = refOf(element);
      if (!ref || seen.has(ref.id)) {
        return [];
      }
      seen.add(ref.id);
      return [{ ref, element }];
    });
  };
  const adapter: SiteAdapter = {
    id,
    matches,
    prepare: () => Promise.resolve(),
    identity: identity ?? ((ref) => Promise.resolve({ id: ref.id, url: ref.url })),
    detect: (document, url = document.URL) => {
      if (!matches(url) && !marker(document)) {
        return null;
      }
      return postAddress(url)?.platform === id ? "single" : "multiple";
    },
    entries,
    items: (document) => entries(document).map(({ ref }) => ref),
    resolve: (element) => {
      const post = element.closest(selectors.post);
      return post ? refOf(post) : null;
    },
    element: (ref, document) =>
      entries(document).find((entry) => entry.ref.id === ref.id)?.element ?? null,
    extract:
      extract ??
      ((ref, document) => {
        const loaded = entries(document);
        const element = loaded.find((entry) => entry.ref.id === ref.id)?.element;
        if (!element) {
          throw new Error("This post is no longer loaded. Scroll it into view and try again.");
        }
        const available = loaded.map((entry) => domPart(entry.element, entry.ref, selectors));
        return Promise.resolve(unrollThread(domPart(element, ref, selectors), available, true));
      }),
  };
  return adapter;
}

export function domFallback(
  adapter: SiteAdapter,
  ref: PostRef,
  document: Document,
  selectors: DomSelectors,
): SocialPost {
  const element = adapter.element(ref, document);
  if (!element) {
    throw new Error(
      "Could not retrieve this post. Open its permalink in the extension and try again.",
    );
  }
  return unrollThread(domPart(element, ref, selectors), [], true);
}

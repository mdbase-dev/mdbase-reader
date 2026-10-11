import { domPart, refFor, type DomSelectors, type PostRef } from "./dom.js";
import { postAddress } from "./identity.js";
import { unrollThread } from "./thread.js";

import type { SocialFetchOptions } from "./api.js";
import type { SocialPost } from "@mdbase-reader/core";

export type PostDetection = "single" | "multiple" | null;
export interface SiteAdapter {
  readonly id: PostRef["platform"];
  matches(url: string): boolean;
  prepare(document: Document, options?: SocialFetchOptions): Promise<void>;
  identity(ref: PostRef, options?: SocialFetchOptions): Promise<{ id: string; url: string }>;
  detect(document: Document, url?: string): PostDetection;
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
): SiteAdapter {
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
    items: (document) =>
      [...document.querySelectorAll(selectors.post)]
        .flatMap((element) => {
          const ref = refFor(element, id, selectors);
          return ref ? [ref] : [];
        })
        .filter((ref, index, items) => items.findIndex((item) => item.id === ref.id) === index),
    resolve: (element) => {
      const post = element.closest(selectors.post);
      return post ? refFor(post, id, selectors) : null;
    },
    element: (ref, document) =>
      [...document.querySelectorAll(selectors.post)].find(
        (element) => refFor(element, id, selectors)?.id === ref.id,
      ) ?? null,
    extract:
      extract ??
      ((ref, document) => {
        const element = adapter.element(ref, document);
        if (!element) {
          throw new Error("This post is no longer loaded. Scroll it into view and try again.");
        }
        const selected = domPart(element, ref, selectors);
        const available = adapter.items(document).flatMap((item) => {
          const node = adapter.element(item, document);
          return node ? [domPart(node, item, selectors)] : [];
        });
        return Promise.resolve(unrollThread(selected, available, true));
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

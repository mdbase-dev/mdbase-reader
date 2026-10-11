import { matchTextQuote, normalizedSourceUrl, textQuoteAt } from "@mdbase-reader/core";
import {
  adapterFor,
  nearestPost,
  postAddress,
  postHtml,
  postTitle,
} from "@mdbase-reader/web-capture";

import { pageText } from "./page-annotations.js";

import type { PageProjection, PageQuote } from "./page-annotations.js";
import type { SelectedWebCapture } from "./page-capture.js";
import type { QuoteSelector, SocialPost } from "@mdbase-reader/core";
import type { PostRef, SiteAdapter } from "@mdbase-reader/web-capture";

export interface SocialPageItems {
  readonly mode: "single" | "multiple";
  readonly items: readonly PostRef[];
  readonly nearest: string | null;
}
export interface SocialPageBridge {
  items(): SocialPageItems | null;
  refreshItems(): Promise<SocialPageItems | null>;
  capture(id?: string): Promise<SelectedWebCapture | null>;
  identities(): Promise<readonly PostRef[] | null>;
  draw(quotes: readonly PageQuote[], expectedUrl: string, focus?: number): PageProjection;
}

declare global {
  var mdbaseReaderSocialPage: SocialPageBridge | undefined;
}

function socialItems(doc: Document): SocialPageItems | null {
  const adapter = adapterFor(doc);
  const mode = adapter?.detect(doc);
  if (!adapter || !mode) {
    return null;
  }
  const items = adapter.items(doc);
  return { mode, items, nearest: nearestPost(items, doc.defaultView?.innerHeight ?? 800) };
}

function boundaryElement(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

/** Selections crossing post boundaries do not resolve to either post. */
export function selectedPost(doc: Document, adapter: SiteAdapter): PostRef | null {
  const selected = doc.getSelection();
  if (!selected?.rangeCount || selected.isCollapsed) {
    return null;
  }
  const range = selected.getRangeAt(0);
  const start = boundaryElement(range.startContainer);
  const end = boundaryElement(range.endContainer);
  if (!start || !end) {
    return null;
  }
  const ref = adapter.resolve(start);
  return ref && adapter.resolve(end)?.id === ref.id ? ref : null;
}

function captureRef(
  doc: Document,
  adapter: SiteAdapter,
  listing: SocialPageItems,
  id?: string,
): PostRef | null {
  if (id) {
    return listing.items.find((item) => item.id === id) ?? null;
  }
  const selection = selectedPost(doc, adapter);
  if (selection) {
    return selection;
  }
  const address = postAddress(doc.location.href);
  if (listing.mode !== "single" || !address) {
    return null;
  }
  // An explicit permalink can be fetched publicly; X always needs its matching live DOM.
  return (
    listing.items.find((item) => item.id === address.id) ??
    (adapter.id === "x" ? null : { ...address, author: "", snippet: "", top: 0, bottom: 0 })
  );
}

async function resolvePost(
  adapter: SiteAdapter,
  ref: PostRef,
  doc: Document,
): Promise<{ post: SocialPost; identity: { id: string; url: string } }> {
  const post = await adapter.extract(ref, doc);
  const identity = await adapter.identity(ref).catch((reason: unknown) => {
    if (post.parts.length !== 1) {
      throw reason;
    }
    return { id: post.id, url: post.url };
  });
  return { post, identity };
}

function readableSelection(
  post: SocialPost,
  id: string,
  raw: QuoteSelector | null,
): QuoteSelector | null {
  if (!raw) {
    return null;
  }
  const parsed = new DOMParser().parseFromString(postHtml(post), "text/html");
  const part = [...parsed.querySelectorAll("[data-post-id]")].find(
    (node) => node.getAttribute("data-post-id") === id,
  );
  if (!part) {
    return null;
  }
  const partText = pageText({ action: "text" }, parsed, part).text ?? "";
  const match = matchTextQuote(partText, raw);
  if (!match || match.ambiguous) {
    throw new Error("The selected passage is ambiguous inside this post. Select a longer passage.");
  }
  // Context is taken from the post's readable representation, not feed chrome or neighbours.
  return textQuoteAt(partText, match.start, match.end);
}

async function captureSocialPage(
  doc: Document,
  canonical: Map<string, string>,
  id?: string,
): Promise<SelectedWebCapture | null> {
  const adapter = adapterFor(doc);
  await adapter?.prepare(doc);
  const listing = socialItems(doc);
  if (!adapter || !listing) {
    return null;
  }
  const ref = captureRef(doc, adapter, listing, id);
  const pageUrl = doc.location.href;
  const retrievedAt = new Date().toISOString();
  if (!ref) {
    if (id || listing.mode === "single") {
      throw new Error("The post is not loaded. Scroll it into view and try again.");
    }
    return {
      kind: "html",
      submittedUrl: pageUrl,
      canonicalUrl: pageUrl,
      retrievedAt,
      pageTitle: "Choose posts to save",
      html: "",
      selection: null,
      pageUrl,
      social: listing,
    };
  }
  const root = adapter.element(ref, doc);
  const selected = selectedPost(doc, adapter);
  const raw =
    root && selected?.id === ref.id
      ? (pageText({ action: "selection" }, doc, root).selection ?? null)
      : null;
  const { post, identity } = await resolvePost(adapter, ref, doc);
  canonical.set(ref.url, identity.url);
  return {
    kind: "html",
    submittedUrl: post.url,
    canonicalUrl: post.url,
    retrievedAt,
    pageTitle: postTitle(post),
    html: postHtml(post),
    selection: readableSelection(post, identity.id, raw),
    ...(raw ? { selectionPostId: identity.id } : {}),
    post,
    pageUrl,
    social: listing,
  };
}

function drawSocialQuotes(
  doc: Document,
  canonical: ReadonlyMap<string, string>,
  quotes: readonly PageQuote[],
  expectedUrl: string,
  focus?: number,
): PageProjection {
  if (doc.location.href.split("#")[0] !== expectedUrl.split("#")[0]) {
    throw new Error("The tab navigated away.");
  }
  const adapter = adapterFor(doc);
  const outcomes: PageProjection["outcomes"][number][] = quotes.map(() => "missing");
  pageText({ action: "draw", quotes: [] }, doc);
  // Runs on every feed mutation: one pass over the posts, and quotes grouped by post up front.
  const byPost = new Map<string, { quote: PageQuote; index: number }[]>();
  quotes.forEach((quote, index) => {
    if (quote.postUrl) {
      const url = normalizedSourceUrl(quote.postUrl);
      byPost.set(url, [...(byPost.get(url) ?? []), { quote, index }]);
    }
  });
  if (adapter?.detect(doc) && byPost.size) {
    for (const { ref, element: root } of adapter.entries(doc)) {
      const matching = byPost.get(normalizedSourceUrl(canonical.get(ref.url) ?? ref.url)) ?? [];
      if (!matching.length) {
        continue;
      }
      const localFocus = matching.findIndex(({ index }) => index === focus);
      const projection = pageText(
        {
          action: "draw",
          quotes: matching.map(({ quote }) => quote),
          append: true,
          ...(localFocus === -1 ? {} : { focus: localFocus }),
        },
        doc,
        root,
      ).projection;
      matching.forEach(({ index }, position) => {
        outcomes[index] = projection?.outcomes[position] ?? "missing";
      });
    }
  }
  return {
    outcomes,
    report: {
      total: quotes.length,
      shown: outcomes.filter((value) => value === "shown").length,
      missing: outcomes.filter((value) => value === "missing").length,
      ambiguous: outcomes.filter((value) => value === "ambiguous").length,
    },
  };
}

export function createSocialPageBridge(doc: Document): SocialPageBridge {
  const identities = new Map<string, Promise<PostRef>>();
  const canonical = new Map<string, string>();
  return {
    items: () => socialItems(doc),
    refreshItems: async () => {
      await adapterFor(doc)?.prepare(doc);
      return socialItems(doc);
    },
    capture: (id) => captureSocialPage(doc, canonical, id),
    identities: async () => {
      const adapter = adapterFor(doc);
      await adapter?.prepare(doc).catch(() => undefined);
      const listing = socialItems(doc);
      if (!adapter || !listing) {
        return null;
      }
      const height = doc.defaultView?.innerHeight ?? 800;
      const visible = listing.items.filter((ref) => ref.bottom > 0 && ref.top < height);
      return Promise.all(
        visible.map((ref) => {
          let pending = identities.get(ref.id);
          if (!pending) {
            pending = resolvePost(adapter, ref, doc).then(({ post, identity }) => {
              canonical.set(ref.url, identity.url);
              return { ...ref, id: identity.id, url: identity.url, sourceUrl: post.url };
            });
            if (identities.size >= 500) {
              const oldest = identities.keys().next().value;
              if (oldest) {
                identities.delete(oldest);
              }
            }
            identities.set(ref.id, pending);
            void pending.catch(() => identities.delete(ref.id));
          }
          return pending.catch(() => ref);
        }),
      );
    },
    draw: (quotes, url, focus) => drawSocialQuotes(doc, canonical, quotes, url, focus),
  };
}

function installSocialPage(): void {
  globalThis.mdbaseReaderSocialPage = createSocialPageBridge(document);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = (): void => {
    if (timer) {
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      if (globalThis.mdbaseReaderSocialPage?.items()) {
        void chrome.runtime.sendMessage({ type: "mdbase-reader/posts-changed" }).catch(() => {
          observer.disconnect();
          document.removeEventListener("scroll", changed);
        });
      }
    }, 600);
  };
  const observer = new MutationObserver((mutations) => {
    if (mutations.some(postMutation)) {
      changed();
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["href", "datetime"],
  });
  document.addEventListener("scroll", changed, { passive: true });
}

function postMutation(mutation: MutationRecord): boolean {
  const target = boundaryElement(mutation.target);
  if (target?.closest("[data-mdbase-reader-highlights],[data-mdbase-reader-ui]")) {
    return false;
  }
  return (
    mutation.type !== "childList" ||
    [...mutation.addedNodes, ...mutation.removedNodes].some(
      (node) =>
        !(node instanceof Element) ||
        !node.matches("[data-mdbase-reader-highlights],[data-mdbase-reader-ui]"),
    )
  );
}

if (typeof chrome !== "undefined" && !globalThis.mdbaseReaderSocialPage) {
  installSocialPage();
}

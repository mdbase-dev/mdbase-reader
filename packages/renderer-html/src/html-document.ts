import { highlightPalette, outsideArticleAttribute } from "@mdbase-reader/core";

import { annotationHighlightCss } from "./html-css-highlights.js";

const blockedElements = [
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "portal",
  "input",
  "textarea",
  "select",
  "option",
  "base",
  "link",
  "meta[http-equiv]",
] as const;

/** Controls whose content is still part of the text: kept as plain containers. */
const unwrappedElements = ["form", "button"] as const;

/**
 * Set on page text outside the article while a highlight or search result in it is shown:
 * `all` on the block holding it, `path` on the hidden elements around that block.
 */
export const outsideArticleRevealedAttribute = "data-reader-revealed";

const urlAttributes = ["href", "src", "poster", "action", "formaction", "xlink:href"] as const;

/** Shared with background indexing: omit exactly the renderer's blocked content. */
export function extractArchivedHtmlText(source: string): string {
  return htmlDocumentText(parseHtmlDocument(source));
}

/** The article's text, for search: page text kept outside the article is left out. */
export function htmlDocumentText(document: Document): string {
  if (!document.body.querySelector(`[${outsideArticleAttribute}]`)) {
    return document.body.textContent;
  }
  let text = "";
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) =>
        node.nodeType === Node.TEXT_NODE
          ? NodeFilter.FILTER_ACCEPT
          : (node as Element).hasAttribute(outsideArticleAttribute)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_SKIP,
    },
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    text += (node as Text).data;
  }
  return text;
}

function parseHtmlDocument(source: string): Document {
  const parsed = new DOMParser().parseFromString(source, "text/html");
  for (const element of parsed.querySelectorAll(blockedElements.join(","))) {
    element.remove();
  }
  return parsed;
}

export function prepareHtmlDocument(source: string): string {
  // A parsed document is inert: nothing loads before its attributes are sanitized below.
  const parsed = parseHtmlDocument(source);
  // Removing these would drop text the original page shows, such as a page wrapped in a form.
  for (const element of parsed.querySelectorAll(unwrappedElements.join(","))) {
    if (element.closest(`[${outsideArticleAttribute}]`)) {
      // Outside the article, its text keeps an element of its own (and the marker), so
      // Reader can hide or show it.
      const span = parsed.createElement("span");
      if (element.hasAttribute(outsideArticleAttribute)) {
        span.setAttribute(outsideArticleAttribute, "");
      }
      span.append(...element.childNodes);
      element.replaceWith(span);
    } else {
      element.replaceWith(...element.childNodes);
    }
  }
  for (const element of parsed.querySelectorAll("*")) {
    sanitizeAttributes(element);
  }
  parsed.head.prepend(cspMeta(parsed));
  parsed.head.append(readerStyle(parsed));
  return `<!doctype html>\n${parsed.documentElement.outerHTML}`;
}

function sanitizeAttributes(element: Element): void {
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLocaleLowerCase();
    if (name.startsWith("on") || name === "srcdoc" || name === "style") {
      element.removeAttribute(attribute.name);
    }
  }
  for (const name of urlAttributes) {
    const value = element.getAttribute(name)?.trim();
    if (value && !safeResource(name, value)) {
      element.removeAttribute(name);
    }
  }
}

function safeResource(attribute: string, value: string): boolean {
  if (attribute === "href" || attribute === "xlink:href") {
    return value.startsWith("#");
  }
  return /^data:image\/(?:png|gif|jpeg|webp|avif);base64,/iu.test(value);
}

function cspMeta(document: Document): HTMLMetaElement {
  const meta = document.createElement("meta");
  meta.httpEquiv = "Content-Security-Policy";
  meta.content =
    "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'";
  return meta;
}

function readerStyle(document: Document): HTMLStyleElement {
  const style = document.createElement("style");
  style.dataset["mdbaseReader"] = "document";
  style.textContent = `
    /* Colours follow the app (html-palette.ts); these system colours only cover the first paint. */
    :root { color-scheme: light; background: Canvas; color: CanvasText; }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { max-width: 46rem; margin: 0 auto; padding: 5rem 3rem 9rem; font: 18px/1.72 Georgia, 'Times New Roman', serif; }
    main, article { display: block; }
    /* Page text outside the article: kept so highlights made on the live page are found. */
    [${outsideArticleAttribute}]:not([${outsideArticleRevealedAttribute}]) { display: none; }
    [${outsideArticleRevealedAttribute}="path"] > :not([${outsideArticleRevealedAttribute}]) { display: none; }
    [${outsideArticleAttribute}][${outsideArticleRevealedAttribute}] { color: color-mix(in srgb, currentColor 72%, transparent); }
    .social-post > header h1 { font-size: 2rem; margin-bottom: .5rem; }
    .social-post header, .social-post time, .social-post figcaption, .social-post footer { font: .85em/1.5 ui-sans-serif, system-ui, sans-serif; color: color-mix(in srgb, currentColor 72%, transparent); }
    .post-part { margin-block: 2rem; padding-top: 1.5rem; border-top: 1px solid color-mix(in srgb, currentColor 18%, transparent); }
    .post-part header p { margin-block: 0 .25rem; }
    .social-post figure { margin-inline: 0; }
    .quoted-post .post-part { border-top: 0; padding-top: 0; }
    h1, h2, h3, h4 { color: inherit; font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.15; letter-spacing: -0.025em; }
    h1 { margin: 0 0 2.4rem; font-size: clamp(2.15rem, 6vw, 3.7rem); }
    h2 { margin-top: 2.8rem; font-size: 1.65rem; }
    p, li, blockquote { text-wrap: pretty; }
    img, svg, video { max-width: 100%; height: auto; }
    a { color: inherit; text-decoration-color: #3ba5d8; text-underline-offset: .16em; }
    blockquote { margin-inline: 0; padding-left: 1.4rem; border-left: 2px solid #3ba5d8; color: color-mix(in srgb, currentColor 72%, transparent); }
    pre { overflow: auto; padding: 1rem; background: rgba(0,0,0,.06); }
    ::selection { background: rgba(64, 174, 224, .28); }
    ::highlight(reader-search-passage) { background: Highlight; color: HighlightText; text-decoration: underline; }
    /* One highlight per palette colour, with light and dark washes (html-css-highlights.ts). */
    ${annotationHighlightCss()}
    mark[data-reader-annotation] { background: ${highlightPalette.yellow.light.wash}; color: inherit; }
    :root[data-reader-scheme="dark"] pre { background: rgba(255,255,255,.06); }
    :root[data-reader-scheme="dark"] mark[data-reader-annotation] { background: ${highlightPalette.yellow.dark.wash}; }
    @media (max-width: 640px) { body { padding: 3rem 1.5rem 7rem; font-size: 17px; } }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
    @media (forced-colors: active) { blockquote { color: CanvasText; } }
  `;
  return style;
}

const blockedElements = [
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "portal",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "base",
  "link",
  "meta[http-equiv]",
] as const;

const urlAttributes = ["href", "src", "poster", "action", "formaction", "xlink:href"] as const;

export function prepareHtmlDocument(source: string): string {
  const parsed = new DOMParser().parseFromString(neutralizeFetchAttributes(source), "text/html");
  for (const element of parsed.querySelectorAll(blockedElements.join(","))) {
    element.remove();
  }
  for (const element of parsed.querySelectorAll("*")) {
    sanitizeAttributes(element);
  }
  parsed.head.prepend(cspMeta(parsed));
  parsed.head.append(readerStyle(parsed));
  return `<!doctype html>\n${parsed.documentElement.outerHTML}`;
}

function neutralizeFetchAttributes(source: string): string {
  const names = "src|poster|href|action|formaction|xlink:href";
  const attribute = new RegExp(`\\s(${names})\\s*=\\s*(?:(["'])(.*?)\\2|([^\\s>]+))`, "gisu");
  return source.replace(
    attribute,
    (match, name: string, _quote: string | undefined, quoted: string | undefined, bare: string) =>
      safeResource(name.toLocaleLowerCase(), (quoted ?? bare).trim()) ? match : "",
  );
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
    :root { color-scheme: light dark; background: #f4f1eb; color: #292722; }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { max-width: 46rem; margin: 0 auto; padding: 5rem 3rem 9rem; font: 18px/1.72 Georgia, 'Times New Roman', serif; }
    main, article { display: block; }
    h1, h2, h3, h4 { color: inherit; font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.15; letter-spacing: -0.025em; }
    h1 { margin: 0 0 2.4rem; font-size: clamp(2.15rem, 6vw, 3.7rem); }
    h2 { margin-top: 2.8rem; font-size: 1.65rem; }
    p, li, blockquote { text-wrap: pretty; }
    img, svg, video { max-width: 100%; height: auto; }
    a { color: inherit; text-decoration-color: #3ba5d8; text-underline-offset: .16em; }
    blockquote { margin-inline: 0; padding-left: 1.4rem; border-left: 2px solid #3ba5d8; color: #625e55; }
    pre { overflow: auto; padding: 1rem; background: rgba(0,0,0,.06); }
    ::selection { background: rgba(64, 174, 224, .28); }
    ::highlight(reader-annotations) { background: rgba(247, 210, 78, .42); text-decoration: underline rgba(211, 159, 0, .38) 1px; }
    mark[data-reader-annotation] { background: rgba(247, 210, 78, .42); color: inherit; }
    @media (prefers-color-scheme: dark) {
      :root { background: #211d1e; color: #e7e3dc; }
      blockquote { color: #b8b1a7; }
      pre { background: rgba(255,255,255,.06); }
    }
    @media (max-width: 640px) { body { padding: 3rem 1.5rem 7rem; font-size: 17px; } }
  `;
  return style;
}

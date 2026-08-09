const PUBLICATION_PATH = /^\/__mdbase-reader\/epub\/[^/]+\//u;
const EMBEDDED_RESOURCE_LIMIT = 32 * 1024 * 1024;
const CSS_URL = /url\(\s*(?:(["'])(.*?)\1|([^)]*?))\s*\)/giu;

type FetchResource = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Makes a sanitized content document self-contained before Readium moves it
 * into a blob URL. A blob document is not a service-worker client in Chromium,
 * so its otherwise-correct relative EPUB assets bypass the isolated resource
 * cache. Embedding only resources from the current ephemeral publication keeps
 * images, fonts, and publisher CSS working without opening a network channel.
 */
export async function inlinePublicationResources(
  document: Document,
  documentUrl: string,
  fetchResource: FetchResource = (input, init) => fetch(input, init),
): Promise<void> {
  const inliner = new PublicationResourceInliner(documentUrl, fetchResource);
  await Promise.all([
    ...[...document.querySelectorAll<HTMLLinkElement>("link[rel~='stylesheet'][href]")].map(
      async (link) => {
        const css = await inliner.css(link.getAttribute("href") ?? "");
        if (css === null) {
          link.remove();
          return;
        }
        const style = document.createElement("style");
        style.textContent = css;
        link.replaceWith(style);
      },
    ),
    ...[...document.querySelectorAll<HTMLStyleElement>("style")].map(async (style) => {
      style.textContent = await inliner.cssText(style.textContent, documentUrl);
    }),
    ...[...document.querySelectorAll<HTMLElement>("[style]")].map(async (element) => {
      const value = element.getAttribute("style");
      if (value !== null) {
        element.setAttribute("style", await inliner.cssText(value, documentUrl));
      }
    }),
    ...resourceAttributes(document).map(async ({ element, attribute }) => {
      const reference = element.getAttribute(attribute);
      if (!reference || safeEmbeddedReference(reference)) {
        return;
      }
      const embedded = await inliner.data(reference, documentUrl);
      if (embedded) {
        element.setAttribute(attribute, embedded);
      } else {
        element.removeAttribute(attribute);
      }
    }),
  ]);

  // A srcset can initiate network requests independently of src. Responsive
  // publication images are deliberately reduced to their safe src fallback.
  document.querySelectorAll("[srcset]").forEach((element) => element.removeAttribute("srcset"));
}

class PublicationResourceInliner {
  readonly #documentUrl: URL;
  readonly #publicationPath: string;
  readonly #fetchResource: FetchResource;
  readonly #data = new Map<string, Promise<string | null>>();

  constructor(documentUrl: string, fetchResource: FetchResource) {
    this.#documentUrl = new URL(documentUrl);
    this.#publicationPath = PUBLICATION_PATH.exec(this.#documentUrl.pathname)?.[0] ?? "";
    this.#fetchResource = fetchResource;
  }

  async css(reference: string): Promise<string | null> {
    const url = this.#localUrl(reference, this.#documentUrl.href);
    if (!url) {
      return null;
    }
    const response = await this.#fetchResource(url);
    if (!response.ok) {
      return null;
    }
    return this.cssText(await response.text(), url.href);
  }

  async cssText(css: string, baseUrl: string): Promise<string> {
    const matches = [...css.matchAll(CSS_URL)];
    if (matches.length === 0) {
      return css;
    }
    let result = "";
    let offset = 0;
    for (const match of matches) {
      const index = match.index;
      result += css.slice(offset, index);
      const reference = (match[2] ?? match[3] ?? "").trim();
      if (safeEmbeddedReference(reference)) {
        result += match[0];
      } else {
        const embedded = await this.data(reference, baseUrl);
        result += embedded ? `url("${embedded}")` : 'url("")';
      }
      offset = index + match[0].length;
    }
    return result + css.slice(offset);
  }

  data(reference: string, baseUrl: string): Promise<string | null> {
    const url = this.#localUrl(reference, baseUrl);
    if (!url) {
      return Promise.resolve(null);
    }
    const existing = this.#data.get(url.href);
    if (existing) {
      return existing;
    }
    const pending = this.#fetchResource(url)
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const blob = await response.blob();
        if (blob.size > EMBEDDED_RESOURCE_LIMIT) {
          return null;
        }
        return blobDataUrl(blob);
      })
      .catch(() => null);
    this.#data.set(url.href, pending);
    return pending;
  }

  #localUrl(reference: string, baseUrl: string): URL | null {
    if (!this.#publicationPath) {
      return null;
    }
    let resolved: URL;
    try {
      resolved = new URL(reference, baseUrl);
    } catch {
      return null;
    }
    return resolved.origin === this.#documentUrl.origin &&
      resolved.pathname.startsWith(this.#publicationPath)
      ? resolved
      : null;
  }
}

function resourceAttributes(
  document: Document,
): readonly { readonly element: Element; readonly attribute: string }[] {
  const resources: { element: Element; attribute: string }[] = [];
  for (const selector of ["img[src]", "image[href]", "image[xlink\\:href]", "source[src]"]) {
    for (const element of document.querySelectorAll(selector)) {
      resources.push({
        element,
        attribute: selector.includes("xlink")
          ? "xlink:href"
          : selector.slice(selector.indexOf("[") + 1, -1),
      });
    }
  }
  return resources;
}

function safeEmbeddedReference(reference: string): boolean {
  const value = reference.trim().toLowerCase();
  return value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("#");
}

async function blobDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

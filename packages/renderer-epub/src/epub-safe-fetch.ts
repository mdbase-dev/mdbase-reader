import type { FetchImplementation } from "@readium/shared";

const ACTIVE_ELEMENTS = "script, iframe, frame, frameset, object, embed, form, base";
const URL_ATTRIBUTES = ["href", "src", "xlink:href", "poster", "data", "action", "formaction"];

export const safePublicationFetch: FetchImplementation = async (input, init) => {
  const response = await fetch(input, init);
  if (!response.ok || (init?.method ?? "GET").toUpperCase() === "HEAD") {
    return response;
  }
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "text/html" && mediaType !== "application/xhtml+xml") {
    return response;
  }
  const sanitized = sanitizePublicationMarkup(await response.text(), mediaType);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", `${mediaType}; charset=utf-8`);
  return new Response(sanitized, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export function sanitizePublicationMarkup(markup: string, mediaType: string): string {
  const document = new DOMParser().parseFromString(markup, parserMediaType(mediaType));
  if (document.querySelector("parsererror")) {
    throw new Error("EPUB content document contains invalid markup.");
  }
  document.querySelectorAll(ACTIVE_ELEMENTS).forEach((element) => element.remove());
  document.querySelectorAll("meta[http-equiv]").forEach((element) => {
    if (element.getAttribute("http-equiv")?.toLowerCase() === "refresh") {
      element.remove();
    }
  });
  document.querySelectorAll("link[rel]").forEach((element) => {
    const relations = element.getAttribute("rel")?.toLowerCase().split(/\s+/u) ?? [];
    if (relations.some((relation) => UNSAFE_LINK_RELATIONS.has(relation))) {
      element.remove();
    }
  });
  document.querySelectorAll("*").forEach((element) => sanitizeElement(element));
  return new XMLSerializer().serializeToString(document);
}

function sanitizeElement(element: Element): void {
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    if (name.startsWith("on") || ["srcdoc", "ping"].includes(name)) {
      element.removeAttribute(attribute.name);
    }
  }
  for (const name of URL_ATTRIBUTES) {
    const value = element.getAttribute(name)?.trim();
    if (value && unsafeActiveUrl(value)) {
      element.removeAttribute(name);
    }
  }
}

function unsafeActiveUrl(value: string): boolean {
  let compact = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 32) {
      compact += value.charAt(index);
    }
  }
  compact = compact.toLowerCase();
  return (
    compact.startsWith("javascript:") ||
    compact.startsWith("vbscript:") ||
    compact.startsWith("data:text/html") ||
    compact.startsWith("data:application/xhtml+xml")
  );
}

function parserMediaType(mediaType: string): DOMParserSupportedType {
  return mediaType === "application/xhtml+xml" ? "application/xhtml+xml" : "text/html";
}

const UNSAFE_LINK_RELATIONS = new Set([
  "dns-prefetch",
  "modulepreload",
  "preconnect",
  "prefetch",
  "preload",
  "prerender",
]);

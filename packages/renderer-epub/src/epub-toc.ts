import { XMLParser } from "fast-xml-parser";

import { epubResourceUrl, resolveEpubPath } from "./epub-path.js";

export interface EpubTocLink {
  readonly href: string;
  readonly title?: string;
  readonly children?: readonly EpubTocLink[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
});

export function parseEpubNavigation(
  document: string,
  path: string,
  baseUrl: string,
): readonly EpubTocLink[] {
  const root = object(parser.parse(document));
  const nav = findTocNav(root);
  return nav ? listItems(object(nav["ol"]), path, baseUrl) : [];
}

export function parseNcxNavigation(
  document: string,
  path: string,
  baseUrl: string,
): readonly EpubTocLink[] {
  const root = object(parser.parse(document));
  const navMap = object(object(root?.["ncx"])?.["navMap"]);
  return asArray(navMap?.["navPoint"]).flatMap((item) => ncxPoint(item, path, baseUrl));
}

function findTocNav(value: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  for (const nav of asArray(value["nav"])) {
    const candidate = object(nav);
    if (tokens(candidate?.["@type"]).includes("toc")) {
      return candidate ?? null;
    }
  }
  for (const child of Object.values(value)) {
    for (const item of asArray(child)) {
      const found = findTocNav(object(item));
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function listItems(
  list: Record<string, unknown> | undefined,
  path: string,
  baseUrl: string,
): readonly EpubTocLink[] {
  return asArray(list?.["li"]).flatMap((item) => {
    const candidate = object(item);
    const anchor = object(candidate?.["a"]);
    const href = text(anchor?.["@href"]);
    if (!candidate || !href) {
      return [];
    }
    const children = listItems(object(candidate["ol"]), path, baseUrl);
    const title = nodeText(anchor);
    return [
      {
        href: resolvedHref(baseUrl, path, href),
        ...(title ? { title } : {}),
        ...(children.length ? { children } : {}),
      },
    ];
  });
}

function ncxPoint(value: unknown, path: string, baseUrl: string): readonly EpubTocLink[] {
  const point = object(value);
  const href = text(object(point?.["content"])?.["@src"]);
  if (!point || !href) {
    return [];
  }
  const children = asArray(point["navPoint"]).flatMap((item) => ncxPoint(item, path, baseUrl));
  const title = text(object(point["navLabel"])?.["text"]);
  return [
    {
      href: resolvedHref(baseUrl, path, href),
      ...(title ? { title } : {}),
      ...(children.length ? { children } : {}),
    },
  ];
}

function resolvedHref(baseUrl: string, path: string, href: string): string {
  const fragment = href.split("#", 2)[1];
  return epubResourceUrl(baseUrl, resolveEpubPath(path, href), fragment);
}

function nodeText(value: Record<string, unknown> | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return text(value["#text"] ?? value["span"] ?? value["text"]);
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): readonly unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") {
    const result = String(value).trim();
    return result || undefined;
  }
  return nodeText(object(value));
}

function tokens(value: unknown): readonly string[] {
  return text(value)?.split(/\s+/u) ?? [];
}

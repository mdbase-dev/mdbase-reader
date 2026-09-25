import { XMLParser } from "fast-xml-parser";

import { epubResourceUrl, resolveEpubPath, safeEpubPath } from "./epub-path.js";
import { parseEpubNavigation, parseNcxNavigation, type EpubTocLink } from "./epub-toc.js";

export interface EpubPackageReader {
  readText(path: string): Promise<string>;
}

export interface PreparedEpubManifest {
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly packagePath: string;
  readonly mediaTypes: ReadonlyMap<string, string>;
  readonly resourcePaths: readonly string[];
}

interface PackageItem {
  readonly id: string;
  readonly path: string;
  readonly mediaType: string;
  readonly properties: readonly string[];
}

interface PublicationResourceLink {
  readonly path: string;
  readonly href: string;
  readonly type: string;
  readonly properties?: { readonly contains: readonly string[] };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
});

export async function buildEpubManifest(
  reader: EpubPackageReader,
  baseUrl: string,
): Promise<PreparedEpubManifest> {
  const packagePath = await packageDocumentPath(reader);
  const packageDocument = object(parser.parse(await reader.readText(packagePath)));
  const packageRoot = object(packageDocument?.["package"]);
  if (!packageRoot) {
    throw new Error("EPUB package document is missing its package element.");
  }
  const metadata = object(packageRoot["metadata"]);
  const itemValues = asArray(object(packageRoot["manifest"])?.["item"]);
  const items = itemValues.map((value) => packageItem(value, packagePath));
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const spine = object(packageRoot["spine"]);
  const readingOrder = asArray(spine?.["itemref"]).map((value) => {
    const reference = requiredAttribute(value, "idref", "EPUB spine item");
    const item = itemsById.get(reference);
    if (!item) {
      throw new Error(`EPUB spine references an unknown manifest item: ${reference}`);
    }
    return publicationLink(item, baseUrl);
  });
  if (readingOrder.length === 0) {
    throw new Error("EPUB package has no reading order.");
  }
  const readingPaths = new Set(readingOrder.map((link) => link.path));
  const navigation = items.find((item) => item.properties.includes("nav"));
  const legacyNavigation = legacyNavigationItem(itemsById, spine, items);
  const toc = navigation
    ? parseEpubNavigation(await reader.readText(navigation.path), navigation.path, baseUrl)
    : legacyNavigation
      ? parseNcxNavigation(
          await reader.readText(legacyNavigation.path),
          legacyNavigation.path,
          baseUrl,
        )
      : [];
  const coverId = coverItemId(metadata);
  const resources = items
    .filter((item) => !readingPaths.has(item.path))
    .map((item) => ({
      ...publicationLink(item, baseUrl),
      ...(item.id === coverId || item.properties.includes("cover-image") ? { rel: ["cover"] } : {}),
    }));
  const mediaTypes = new Map(items.map((item) => [item.path, item.mediaType]));

  return {
    packagePath,
    mediaTypes,
    resourcePaths: items.map((item) => item.path),
    manifest: {
      "@context": "https://readium.org/webpub-manifest/context.jsonld",
      metadata: publicationMetadata(metadata, packageRoot),
      links: [{ rel: "self", href: `${baseUrl}manifest.json`, type: "application/webpub+json" }],
      readingOrder: readingOrder.map(({ path: _path, ...link }) => link),
      resources: resources.map(({ path: _path, ...link }) => link),
      ...(toc.length ? { toc } : {}),
    },
  };
}

export async function packageDocumentPath(reader: EpubPackageReader): Promise<string> {
  const container = object(parser.parse(await reader.readText("META-INF/container.xml")));
  const roots = object(object(container?.["container"])?.["rootfiles"]);
  const rootfile = asArray(roots?.["rootfile"])
    .map(object)
    .find((value) => text(value?.["@full-path"]));
  const path = text(rootfile?.["@full-path"]);
  if (!path) {
    throw new Error("EPUB container does not identify a package document.");
  }
  return safeEpubPath(path);
}

function packageItem(value: unknown, packagePath: string): PackageItem {
  const id = requiredAttribute(value, "id", "EPUB manifest item");
  const href = requiredAttribute(value, "href", `EPUB manifest item ${id}`);
  return {
    id,
    path: resolveEpubPath(packagePath, href),
    mediaType: requiredAttribute(value, "media-type", `EPUB manifest item ${id}`),
    properties: tokens(object(value)?.["@properties"]),
  };
}

function publicationLink(item: PackageItem, baseUrl: string): PublicationResourceLink {
  return {
    path: item.path,
    href: epubResourceUrl(baseUrl, item.path),
    type: item.mediaType,
    ...(item.properties.length ? { properties: { contains: item.properties } } : {}),
  };
}

function publicationMetadata(
  metadata: Record<string, unknown> | undefined,
  packageRoot: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  const titles = nodeTexts(metadata?.["title"]);
  if (!titles[0]) {
    throw new Error("EPUB package metadata has no title.");
  }
  const identifiers = nodeTexts(metadata?.["identifier"]);
  const languages = nodeTexts(metadata?.["language"]);
  const authors = nodeTexts(metadata?.["creator"]);
  const direction = text(packageRoot["@page-progression-direction"]);
  const layout = metaProperty(metadata, "rendition:layout");
  return {
    title: titles[0],
    conformsTo: "https://readium.org/webpub-manifest/profiles/epub",
    ...(identifiers[0] ? { identifier: identifiers[0] } : {}),
    ...(languages.length ? { language: languages } : {}),
    ...(authors.length ? { author: authors.map((name) => ({ name })) } : {}),
    ...(layout ? { layout: layout === "pre-paginated" ? "fixed" : "reflowable" } : {}),
    ...(direction === "rtl" || direction === "ltr" ? { readingProgression: direction } : {}),
  };
}

function legacyNavigationItem(
  itemsById: ReadonlyMap<string, PackageItem>,
  spine: Record<string, unknown> | undefined,
  items: readonly PackageItem[],
): PackageItem | undefined {
  const tocId = text(spine?.["@toc"]);
  return (
    (tocId ? itemsById.get(tocId) : undefined) ??
    items.find((item) => item.mediaType === "application/x-dtbncx+xml")
  );
}

function coverItemId(metadata: Record<string, unknown> | undefined): string | undefined {
  const cover = asArray(metadata?.["meta"])
    .map(object)
    .find((value) => text(value?.["@name"]) === "cover");
  return text(cover?.["@content"]);
}

function metaProperty(
  metadata: Record<string, unknown> | undefined,
  property: string,
): string | undefined {
  const value = asArray(metadata?.["meta"])
    .map(object)
    .find((candidate) => text(candidate?.["@property"]) === property);
  return text(value);
}

function requiredAttribute(value: unknown, attribute: string, context: string): string {
  const result = text(object(value)?.[`@${attribute}`]);
  if (!result) {
    throw new Error(`${context} is missing ${attribute}.`);
  }
  return result;
}

function nodeTexts(value: unknown): readonly string[] {
  return asArray(value)
    .map((item) => text(item))
    .filter((item): item is string => Boolean(item));
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
  const candidate = object(value);
  return candidate ? text(candidate["#text"]) : undefined;
}

function tokens(value: unknown): readonly string[] {
  return text(value)?.split(/\s+/u) ?? [];
}

export type { EpubTocLink };

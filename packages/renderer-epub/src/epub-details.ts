import { XMLParser } from "fast-xml-parser";

import { EpubArchive } from "./epub-archive.js";
import {
  buildEpubManifest,
  epubCoverImage,
  packageDocumentPath,
  type EpubPackageReader,
} from "./epub-manifest.js";

/** The bibliographic part of an EPUB's package metadata (Dublin Core). */
export interface EpubDetails {
  readonly title?: string;
  readonly authors: readonly string[];
  readonly language?: string;
  readonly publisher?: string;
  readonly published?: string;
  readonly description?: string;
  /** `dc:identifier` values: ISBNs, DOIs, URNs and publisher-specific IDs. */
  readonly identifiers: readonly string[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
});

/** Reads an EPUB's package metadata for suggesting a title and finding its ISBN before import. */
export async function readEpubDetails(bytes: Uint8Array): Promise<EpubDetails> {
  const archive = await EpubArchive.open(new Blob([bytes.slice().buffer]));
  try {
    return await epubDetails(archive);
  } finally {
    await archive.close();
  }
}

/** Covers above this size are skipped; a thumbnail never needs a print-resolution scan. */
const MAX_COVER_BYTES = 6 * 1024 * 1024;

/** The EPUB's cover image, for a library thumbnail, or null when it names none. */
export async function readEpubCover(
  bytes: Uint8Array,
  options: { readonly signal?: AbortSignal } = {},
): Promise<Blob | null> {
  options.signal?.throwIfAborted();
  // A Blob copies its parts once, so the bytes need no copy of their own first.
  const archive = await EpubArchive.open(new Blob([bytes as Uint8Array<ArrayBuffer>]));
  try {
    options.signal?.throwIfAborted();
    const cover = await epubCoverImage(archive);
    const entry = cover && archive.entries.find(({ path }) => path === cover.path);
    if (!cover || !entry || entry.uncompressedSize > MAX_COVER_BYTES) {
      return null;
    }
    options.signal?.throwIfAborted();
    return await archive.readBlob(cover.path, cover.mediaType);
  } finally {
    await archive.close();
  }
}

export async function readEpubChapterOutline(bytes: Uint8Array): Promise<{
  readonly spine: readonly string[];
  readonly entries: readonly {
    readonly title: string;
    readonly level: number;
    readonly href: string;
    readonly fragment?: string;
  }[];
}> {
  const archive = await EpubArchive.open(new Blob([bytes.slice().buffer]));
  try {
    const { manifest } = await buildEpubManifest(archive, "");
    const links = (value: unknown): readonly Readonly<Record<string, unknown>>[] =>
      Array.isArray(value)
        ? value.flatMap((item) => {
            const link = record(item);
            return link ? [link] : [];
          })
        : [];
    const hrefOf = (link: Readonly<Record<string, unknown>>): string =>
      typeof link["href"] === "string" ? link["href"] : "";
    const pathOf = (href: string): string => decodeURIComponent(href.split("#")[0] ?? "");
    const flatten = (
      items: readonly Readonly<Record<string, unknown>>[],
      level: number,
    ): { title: string; level: number; href: string; fragment?: string }[] =>
      items.flatMap((link) => {
        const href = hrefOf(link);
        const fragment = href.split("#")[1];
        return [
          {
            title: typeof link["title"] === "string" ? link["title"] : "Untitled section",
            level,
            href: pathOf(href),
            ...(fragment ? { fragment } : {}),
          },
          ...flatten(links(link["children"]), level + 1),
        ];
      });
    return {
      spine: links(manifest["readingOrder"]).map((link) => pathOf(hrefOf(link))),
      entries: flatten(links(manifest["toc"]), 0),
    };
  } finally {
    await archive.close();
  }
}

export async function epubDetails(reader: EpubPackageReader): Promise<EpubDetails> {
  const packageDocument = record(
    parser.parse(await reader.readText(await packageDocumentPath(reader))),
  );
  const metadata = record(record(packageDocument?.["package"])?.["metadata"]);
  const first = (key: string): string | undefined => texts(metadata?.[key])[0];
  const title = first("title");
  const language = first("language");
  const publisher = first("publisher");
  const published = first("date");
  const description = first("description")
    ?.replace(/<[^>]*>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return {
    ...(title ? { title } : {}),
    authors: texts(metadata?.["creator"]),
    ...(language ? { language } : {}),
    ...(publisher ? { publisher } : {}),
    ...(published ? { published } : {}),
    ...(description ? { description } : {}),
    identifiers: texts(metadata?.["identifier"]),
  };
}

function texts(value: unknown): string[] {
  return (Array.isArray(value) ? value : value === undefined ? [] : [value]).flatMap((item) => {
    const content = typeof item === "string" ? item : record(item)?.["#text"];
    const trimmed = typeof content === "string" ? content.replace(/\s+/gu, " ").trim() : "";
    return trimmed ? [trimmed] : [];
  });
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

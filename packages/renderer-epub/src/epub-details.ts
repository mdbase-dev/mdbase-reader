import { XMLParser } from "fast-xml-parser";

import { EpubArchive } from "./epub-archive.js";
import { packageDocumentPath, type EpubPackageReader } from "./epub-manifest.js";

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

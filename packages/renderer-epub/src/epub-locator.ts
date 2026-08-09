import { Locator, type Publication } from "@readium/shared";

import { epubResourceUrl, safeEpubPath } from "./epub-path.js";

const readerResourcePrefix = "/__mdbase-reader/epub/";

export function stableReadiumLocator(
  locator: Locator,
  publicationBaseUrl: string,
): Readonly<Record<string, unknown>> {
  const serialized = locator.serialize() as Readonly<Record<string, unknown>>;
  return {
    ...serialized,
    href: stableEpubHref(locator.href, publicationBaseUrl),
  };
}

export function sessionReadiumLocator(
  value: Readonly<Record<string, unknown>>,
  publicationBaseUrl: string,
): Locator | null {
  const href = value["href"];
  if (typeof href !== "string" || href.trim().length === 0) {
    return null;
  }
  try {
    return (
      Locator.deserialize({
        ...value,
        href: epubResourceUrl(publicationBaseUrl, stableEpubHref(href, publicationBaseUrl)),
      }) ?? null
    );
  } catch {
    return null;
  }
}

export function sessionReadiumLocatorForPublication(
  value: Readonly<Record<string, unknown>>,
  publication: Publication,
  publicationBaseUrl: string,
): Locator | null {
  const direct = sessionReadiumLocator(value, publicationBaseUrl);
  if (direct) {
    return direct;
  }
  const fragments = objectValue(value["locations"])?.["fragments"];
  const cfi = Array.isArray(fragments)
    ? fragments.find((fragment): fragment is string => typeof fragment === "string")
    : undefined;
  const index = cfi ? readingOrderIndexFromCfi(cfi) : null;
  const link = index === null ? undefined : publication.readingOrder.items[index];
  return link
    ? sessionReadiumLocator(
        {
          ...value,
          href: link.href,
          type:
            typeof value["type"] === "string"
              ? value["type"]
              : (link.type ?? "application/xhtml+xml"),
        },
        publicationBaseUrl,
      )
    : null;
}

export function readingOrderIndexFromCfi(cfi: string): number | null {
  const packagePath = /^epubcfi\(\/6(?:\[[^\]]*\])?\/(\d+)(?:\[[^\]]*\])?!/u.exec(cfi.trim());
  const step = packagePath?.[1] ? Number(packagePath[1]) : Number.NaN;
  return Number.isInteger(step) && step >= 2 && step % 2 === 0 ? step / 2 - 1 : null;
}

export function stableEpubHref(href: string, publicationBaseUrl: string): string {
  const trimmed = href.trim();
  if (!trimmed) {
    throw new Error("Readium returned an empty EPUB resource location.");
  }
  if (!absoluteUrl(trimmed)) {
    return decodedEpubPath(trimmed);
  }
  const target = new URL(trimmed);
  const base = new URL(publicationBaseUrl);
  if (target.origin === base.origin && target.pathname.startsWith(base.pathname)) {
    return decodedEpubPath(target.pathname.slice(base.pathname.length));
  }
  const markerIndex = target.pathname.indexOf(readerResourcePrefix);
  if (target.origin === base.origin && markerIndex >= 0) {
    const afterPrefix = target.pathname.slice(markerIndex + readerResourcePrefix.length);
    const resourcePath = afterPrefix.split("/").slice(1).join("/");
    return decodedEpubPath(resourcePath);
  }
  throw new Error("Readium returned an EPUB location outside the prepared publication.");
}

function decodedEpubPath(value: string): string {
  const path = value.split(/[?#]/u, 1)[0] ?? "";
  try {
    return safeEpubPath(
      path
        .split("/")
        .map((segment) => decodeURIComponent(segment))
        .join("/"),
    );
  } catch {
    throw new Error(`Readium returned an invalid EPUB resource location: ${value}`);
  }
}

function absoluteUrl(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:/iu.test(value);
}

function objectValue(value: unknown): Readonly<Record<string, unknown>> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

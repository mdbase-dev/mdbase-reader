import { parseDocumentRange } from "@mdbase-reader/core";

import type { DocumentDescriptor, SourceSummary } from "@mdbase-reader/core";
import type {
  ReaderLocator,
  ReadingRangeResolution,
  ReadingSurface,
} from "@mdbase-reader/reading-surface";

const cache = new WeakMap<ReadingSurface, Map<string, Promise<ReadingRangeResolution | null>>>();
const contexts = new WeakMap<ReadingSurface, string>();

function rawRange(source: SourceSummary, entry: DocumentDescriptor): unknown {
  const properties =
    source.properties ??
    ("frontmatter" in source
      ? (source.frontmatter as Readonly<Record<string, unknown>>)
      : undefined);
  const documents = properties?.["documents"];
  if (!Array.isArray(documents)) {
    return undefined;
  }
  const raw: unknown = documents.find((value: unknown) => {
    if (!value || typeof value !== "object") {
      return false;
    }
    const item = value as Record<string, unknown>;
    return item["file_id"] === entry.fileId || item["file"] === entry.file;
  });
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>)["range"] : undefined;
}

/** Includes the source and exact bounds, not just the shared file/revision. */
export function sourceReadingContextKey(source: SourceSummary): string {
  return JSON.stringify([
    source.id,
    source.documents.map((entry) => [
      entry.fileId,
      entry.revision,
      entry.range ?? rawRange(source, entry),
    ]),
  ]);
}

export function bindSurfaceReadingContext(
  surface: ReadingSurface,
  source: SourceSummary | string,
): void {
  contexts.set(surface, typeof source === "string" ? source : sourceReadingContextKey(source));
}

export function surfaceReadingContextKey(surface: ReadingSurface): string {
  return contexts.get(surface) ?? "";
}

/** Validation is derived from the entry AND opened revision, never from page count alone. */
export function resolveSourceReadingRange(
  source: SourceSummary,
  surface: ReadingSurface,
): Promise<ReadingRangeResolution | null> {
  const key = sourceReadingContextKey(source);
  let entries = cache.get(surface);
  if (!entries) {
    entries = new Map();
    cache.set(surface, entries);
  }
  let result = entries.get(key);
  if (!result) {
    result = resolve(source, surface);
    entries.set(key, result);
  }
  return result;
}

async function resolve(
  source: SourceSummary,
  surface: ReadingSurface,
): Promise<ReadingRangeResolution | null> {
  const entry = source.documents.find(
    (document) => document.fileId === surface.document.document.fileId,
  );
  if (!entry) {
    return null;
  }
  const raw = entry.range ?? rawRange(source, entry);
  if (raw === undefined) {
    return null;
  }
  if (entry.revision !== surface.document.document.revision) {
    return {
      valid: false,
      message:
        "This file has changed. The chapter range belongs to an older revision and cannot be applied to these bytes.",
    };
  }
  const range = parseDocumentRange(raw);
  if (!range) {
    return { valid: false, message: "This chapter has an invalid or unsupported document range." };
  }
  if (!surface.resolveReadingRange) {
    return { valid: false, message: "The chapter range cannot be verified by this renderer." };
  }
  try {
    return await surface.resolveReadingRange(range);
  } catch {
    return {
      valid: false,
      message: "The chapter range could not be verified against this document.",
    };
  }
}

export function positionWithinReadingRange(
  resolution: ReadingRangeResolution,
  locator: ReaderLocator,
): boolean {
  return resolution.valid && resolution.measure(locator)?.position === "inside";
}

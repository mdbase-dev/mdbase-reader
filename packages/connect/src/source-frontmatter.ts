import {
  parseDocumentRange,
  type DocumentRange,
  type FileId,
  type FileRevision,
  type PlannedSourceFileImport,
  type PlannedSourceRepresentation,
  type SocialPost,
  type SocialPostReference,
} from "@mdbase-reader/core";

import { ConnectRepositoryError } from "./repository-client.js";
import { documentEntry } from "./source-files.js";

import type { CollectionFileDescriptor } from "@mdbase-dev/connect";

type Descriptors = ReadonlyMap<PlannedSourceRepresentation["role"], CollectionFileDescriptor>;

function object(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

/** Change only the owned relation; retain unrelated entries and extension properties verbatim. */
export function sourcePartOfPatch(
  frontmatter: Readonly<Record<string, unknown>>,
  target: string | null,
): Readonly<Record<string, unknown>> {
  const current = frontmatter["relations"];
  if (current !== undefined && !Array.isArray(current)) {
    throw new Error("Invalid source relations.");
  }
  const relations: unknown[] = [];
  let replaced = false;
  for (const entry of Array.isArray(current) ? current : []) {
    const relation = object(entry);
    if (relation?.["relation"] !== "part-of") {
      relations.push(entry);
    } else if (target !== null) {
      relations.push({ ...relation, target });
      replaced = true;
    }
  }
  if (target !== null && !replaced) {
    relations.push({ relation: "part-of", target });
  }
  return { relations: relations.length ? relations : null };
}

/** A range belongs to a particular document revision, never silently to its replacement. */
export function documentRangePatch(
  frontmatter: Readonly<Record<string, unknown>>,
  id: FileId,
  revision: FileRevision,
  range: DocumentRange | null,
): Readonly<Record<string, unknown>> {
  if (range !== null && !parseDocumentRange(range)) {
    throw new Error("Invalid document range.");
  }
  const current = frontmatter["documents"];
  if (!Array.isArray(current)) {
    throw new Error("Source document not found.");
  }
  const matches = current.filter((entry) => object(entry)?.["file_id"] === id);
  if (matches.length !== 1) {
    throw new Error("Source document missing or ambiguous.");
  }
  if (object(matches[0])?.["revision"] !== revision) {
    throw new Error("Document revision changed.");
  }
  return {
    documents: current.map((entry: unknown): unknown => {
      const item = object(entry);
      if (item?.["file_id"] !== id) {
        return entry;
      }
      const next = { ...item };
      if (range === null) {
        Reflect.deleteProperty(next, "range");
      } else {
        next["range"] = range;
      }
      return next;
    }),
  };
}

/** The frontmatter of a newly created source record. */
export function sourceFrontmatter(
  plan: PlannedSourceFileImport,
  descriptors: Descriptors,
): Readonly<Record<string, unknown>> {
  return {
    id: plan.sourceId,
    title: plan.title,
    kind: plan.kind,
    saved_at: plan.savedAt,
    ...(plan.tags ? { tags: plan.tags } : {}),
    ...metadataFields(plan.metadata),
    ...(plan.capture ? captureFields(plan.capture) : plan.url ? { url: plan.url } : {}),
    // A source created without a file has no `documents` until one is attached.
    ...(plan.representations.length ? { documents: documentEntries(plan, descriptors) } : {}),
    reading: { status: "inbox" },
  };
}

function metadataFields(
  metadata: PlannedSourceFileImport["metadata"],
): Readonly<Record<string, unknown>> {
  if (!metadata) {
    return {};
  }
  return {
    ...(metadata.authors?.length ? { authors: metadata.authors } : {}),
    ...(metadata.published ? { published: metadata.published } : {}),
    ...(metadata.description ? { description: metadata.description } : {}),
    ...(metadata.language ? { language: metadata.language } : {}),
    ...(metadata.site ? { site: metadata.site } : {}),
    ...(metadata.socialPost ? { social_post: socialPostReference(metadata.socialPost) } : {}),
  };
}

function socialPostReference(post: SocialPost): SocialPostReference {
  return {
    platform: post.platform,
    id: post.id,
    url: post.url,
    author: post.author,
    ...(post.published ? { published: post.published } : {}),
    threadRoot: post.threadRoot,
    threadPartial: post.threadPartial,
    parts: post.parts.map((part) => ({
      id: part.id,
      url: part.url,
      ...(part.quoted ? { quoted: { id: part.quoted.id, url: part.quoted.url } } : {}),
    })),
  };
}

function captureFields(
  capture: NonNullable<PlannedSourceFileImport["capture"]>,
): Readonly<Record<string, unknown>> {
  return {
    url: capture.canonicalUrl,
    ...(capture.submittedUrl !== capture.canonicalUrl
      ? { original_url: capture.submittedUrl }
      : {}),
    capture: {
      method: "url",
      application: "dev.mdbase.reader",
      captured_at: capture.retrievedAt,
      submitted_url: capture.submittedUrl,
      canonical_url: capture.canonicalUrl,
      ...(capture.extractor ? { extractor: capture.extractor } : {}),
    },
  };
}

function documentEntries(
  plan: PlannedSourceFileImport,
  descriptors: Descriptors,
): readonly Readonly<Record<string, unknown>>[] {
  const { capture } = plan;
  return plan.representations.map((representation) => {
    const descriptor = descriptors.get(representation.role);
    if (!descriptor) {
      throw new ConnectRepositoryError(
        "create imported source",
        "missing_file_descriptor",
        `The ${representation.role} representation was not committed.`,
      );
    }
    const derivedFrom = representation.derivedFromRole
      ? descriptors.get(representation.derivedFromRole)
      : undefined;
    return documentEntry(representation, descriptor, {
      ...(derivedFrom ? { derived_from_file_id: derivedFrom.fileId } : {}),
      ...(capture && representation.role === "archive"
        ? { origin_url: capture.canonicalUrl, retrieved_at: capture.retrievedAt }
        : {}),
    });
  });
}

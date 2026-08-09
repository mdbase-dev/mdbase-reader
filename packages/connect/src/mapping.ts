import {
  collectionId,
  fileId,
  fileRevision,
  recordRevision,
  sourceId,
  type CollectionId,
  type DocumentDescriptor,
  type Source,
  type SourceSummary,
} from "@mdbase-reader/core";

import type { QueryRecord, RecordDocument } from "@mdbase-dev/connect";

export { annotationFromDocument, annotationFrontmatter } from "./annotation-mapping.js";

function object(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function textArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function documents(value: unknown): readonly DocumentDescriptor[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((candidate) => {
    const item = object(candidate);
    const id = text(item?.["file_id"]);
    const file = text(item?.["file"]);
    const revision = text(item?.["revision"]);
    const role = text(item?.["role"]);
    const mediaType = text(item?.["media_type"]);
    const title = text(item?.["label"]);
    if (!id || !file || !revision || !role || !mediaType) {
      return [];
    }
    try {
      return [
        {
          fileId: fileId(id),
          file,
          revision: fileRevision(revision),
          role,
          mediaType,
          ...(title ? { title } : {}),
        } satisfies DocumentDescriptor,
      ];
    } catch {
      return [];
    }
  });
}

function readingStatus(value: unknown): SourceSummary["readingStatus"] {
  const status = text(object(value)?.["status"]);
  return ["inbox", "queued", "reading", "finished", "archived", "abandoned"].includes(status ?? "")
    ? (status as NonNullable<SourceSummary["readingStatus"]>)
    : undefined;
}

function sourceFields(
  collection: CollectionId,
  path: string,
  frontmatter: Readonly<Record<string, unknown>>,
): SourceSummary {
  const id = text(frontmatter["id"]);
  const title = text(frontmatter["title"]);
  if (!id || !title) {
    throw new Error(`Source ${path} is missing its contract identity or title.`);
  }
  const status = readingStatus(frontmatter["reading"]);
  return {
    collectionId: collection,
    id: sourceId(id),
    path,
    title,
    creators: textArray(frontmatter["authors"]),
    tags: textArray(frontmatter["tags"]),
    ...(status ? { readingStatus: status } : {}),
    documents: documents(frontmatter["documents"]),
  };
}

export function sourceSummaryFromQuery(
  collection: CollectionId,
  record: QueryRecord,
): SourceSummary {
  return sourceFields(
    collection,
    record.path,
    record.effectiveFrontmatter ?? record.frontmatter ?? {},
  );
}

export function sourceFromDocument(collection: CollectionId, record: RecordDocument): Source {
  return {
    ...sourceFields(collection, record.path, record.effectiveFrontmatter),
    body: record.body ?? "",
    recordRevision: recordRevision(record.revision),
    frontmatter: record.frontmatter,
  };
}

export const connectCollectionId = collectionId;

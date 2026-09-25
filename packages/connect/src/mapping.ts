import {
  collectionId,
  dateTime,
  fileId,
  fileRevision,
  recordRevision,
  sourceId,
  validateCslItem,
  type CollectionId,
  type CurrentReadingState,
  type DocumentDescriptor,
  type Source,
  type SourceSummary,
} from "@mdbase-reader/core";

import { readingPositionFromFrontmatter } from "./reading-position.js";

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

function textOrNumber(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
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

function readingState(value: unknown): CurrentReadingState | undefined {
  const candidate = object(value);
  const status = readingStatus(candidate);
  if (!candidate || !status) {
    return undefined;
  }
  const progress = candidate["progress"];
  const documentFileId = text(candidate["document_file_id"]);
  const position = readingPositionFromFrontmatter(candidate["position"]);
  const startedAt = optionalDateTime(candidate["started_at"]);
  const lastOpenedAt = optionalDateTime(candidate["last_opened_at"]);
  const finishedAt = optionalDateTime(candidate["finished_at"]);
  return {
    status,
    ...(typeof progress === "number" && progress >= 0 && progress <= 1 ? { progress } : {}),
    ...(documentFileId ? { documentFileId: fileId(documentFileId) } : {}),
    ...(position ? { position } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(lastOpenedAt ? { lastOpenedAt } : {}),
    ...(finishedAt ? { finishedAt } : {}),
  };
}

function optionalDateTime(value: unknown): ReturnType<typeof dateTime> | undefined {
  const candidate = text(value);
  if (!candidate) {
    return undefined;
  }
  try {
    return dateTime(candidate);
  } catch {
    return undefined;
  }
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
  const reading = readingState(frontmatter["reading"]);
  const citation = citationFields(frontmatter["csl"]);
  return {
    collectionId: collection,
    id: sourceId(id),
    path,
    title,
    creators: textArray(frontmatter["authors"]),
    tags: textArray(frontmatter["tags"]),
    ...sourceMetadataFields(frontmatter, citation),
    ...(reading ? { readingStatus: reading.status, reading } : {}),
    ...(citation?.valid ? { citation: citation.item } : {}),
    ...(citation && !citation.valid ? { citationProblems: citation.problems } : {}),
    documents: documents(frontmatter["documents"]),
  };
}

function sourceMetadataFields(
  frontmatter: Readonly<Record<string, unknown>>,
  citation: ReturnType<typeof citationFields>,
): Partial<SourceSummary> {
  const kind = text(frontmatter["kind"]);
  const published = textOrNumber(frontmatter["published"]);
  const url = text(frontmatter["url"]);
  const site = text(frontmatter["site"]);
  const publication = citation?.valid
    ? (text(citation.item["container-title"]) ?? text(citation.item["publisher"]))
    : undefined;
  return {
    ...(kind ? { kind } : {}),
    ...(published !== undefined ? { published } : {}),
    ...(publication ? { publication } : {}),
    ...(url ? { url } : {}),
    ...(site ? { site } : {}),
  };
}

function citationFields(value: unknown): ReturnType<typeof validateCslItem> | undefined {
  return value === undefined ? undefined : validateCslItem(value);
}

export function sourceSummaryFromQuery(
  collection: CollectionId,
  record: QueryRecord,
): SourceSummary {
  const frontmatter = record.effectiveFrontmatter ?? record.frontmatter ?? {};
  // Library views can show any field as a column, so the listing keeps the frontmatter.
  return { ...sourceFields(collection, record.path, frontmatter), properties: frontmatter };
}

export function sourceFromDocument(collection: CollectionId, record: RecordDocument): Source {
  return {
    ...sourceFields(collection, record.path, record.effectiveFrontmatter),
    properties: record.effectiveFrontmatter,
    body: record.body ?? "",
    recordRevision: recordRevision(record.revision),
    frontmatter: record.frontmatter,
  };
}

export const connectCollectionId = collectionId;

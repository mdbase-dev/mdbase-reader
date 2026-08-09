import {
  annotationId,
  collectionId,
  fileId,
  fileRevision,
  dateTime,
  recordRevision,
  sourceId,
  type Annotation,
  type AnnotationTarget,
  type CollectionId,
  type DocumentDescriptor,
  type HtmlSelector,
  type QuoteSelector,
  type Source,
  type SourceSummary,
} from "@mdbase-reader/core";

import type { JsonObject, QueryRecord, RecordDocument } from "@mdbase-dev/connect";

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

function stableIdFromLink(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) {
    return undefined;
  }
  const match = /^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/u.exec(raw.trim());
  return match?.[1] ?? raw;
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

function quoteSelector(value: unknown): QuoteSelector | undefined {
  const quoteValue = object(value);
  const exact = text(quoteValue?.["exact"]);
  if (!exact) {
    return undefined;
  }
  const prefix = text(quoteValue?.["prefix"]);
  const suffix = text(quoteValue?.["suffix"]);
  return { exact, ...(prefix ? { prefix } : {}), ...(suffix ? { suffix } : {}) };
}

function htmlSelector(value: unknown): HtmlSelector | undefined {
  const htmlValue = object(value);
  const css = text(htmlValue?.["css"]);
  const xpath = text(htmlValue?.["xpath"]);
  return css || xpath ? { ...(css ? { css } : {}), ...(xpath ? { xpath } : {}) } : undefined;
}

function target(value: unknown): AnnotationTarget | undefined {
  const candidate = object(value);
  if (!candidate) {
    return undefined;
  }
  const quote = quoteSelector(candidate["quote"]);
  const cfi = text(object(candidate["epub"])?.["cfi"]);
  const html = htmlSelector(candidate["html"]);
  const result: AnnotationTarget = Object.assign(
    {},
    quote ? { quote } : {},
    cfi ? { epub: { cfi } } : {},
    html ? { html } : {},
  );
  return Object.keys(result).length > 0 ? result : undefined;
}

export function annotationFromDocument(
  collection: CollectionId,
  record: Pick<RecordDocument, "path" | "frontmatter" | "effectiveFrontmatter" | "body">,
): Annotation {
  const fields = record.effectiveFrontmatter;
  const id = text(fields["id"]);
  const source = stableIdFromLink(fields["source"]);
  const annotationType = text(fields["annotation_type"]);
  const createdAt = text(fields["created_at"]);
  if (!id || !source || !annotationType || !createdAt) {
    throw new Error(`Annotation ${record.path} is missing required contract fields.`);
  }
  const selectedTarget = target(fields["target"]);
  const modifiedAt = text(fields["modified_at"]);
  const createdBy = text(fields["created_by"]);
  const motivation = text(fields["motivation"]);
  const color = text(fields["color"]);
  return {
    collectionId: collection,
    id: annotationId(id),
    sourceId: sourceId(source),
    source: text(fields["source"]) ?? source,
    annotationType,
    tags: textArray(fields["tags"]),
    body: record.body ?? "",
    createdAt: dateTime(createdAt),
    ...(modifiedAt ? { modifiedAt: dateTime(modifiedAt) } : {}),
    ...(createdBy ? { createdBy } : {}),
    ...(motivation ? { motivation } : {}),
    ...(color ? { color } : {}),
    ...(selectedTarget ? { target: selectedTarget } : {}),
  };
}

export function annotationFrontmatter(annotation: Annotation): JsonObject {
  return {
    type: "reader-annotation",
    id: annotation.id,
    source: annotation.source,
    annotation_type: annotation.annotationType,
    created_at: annotation.createdAt,
    tags: [...annotation.tags],
    ...(annotation.modifiedAt ? { modified_at: annotation.modifiedAt } : {}),
    ...(annotation.createdBy ? { created_by: annotation.createdBy } : {}),
    ...(annotation.motivation ? { motivation: annotation.motivation } : {}),
    ...(annotation.color ? { color: annotation.color } : {}),
    ...(annotation.target ? { target: annotation.target } : {}),
  };
}

export const connectCollectionId = collectionId;

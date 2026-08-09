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
  type DocumentTarget,
  type DocumentDescriptor,
  type HtmlSelector,
  type PdfQuadPoints,
  type PdfSelector,
  type QuoteSelector,
  type TextPositionSelector,
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

function documentTarget(value: unknown): DocumentTarget | undefined {
  const candidate = object(value);
  const id = text(candidate?.["file_id"]);
  const file = text(candidate?.["file"]);
  const revision = text(candidate?.["revision"]);
  if (!id || !file || !revision) {
    return undefined;
  }
  return {
    fileId: fileId(id),
    file,
    revision: fileRevision(revision),
  };
}

function textPositionSelector(value: unknown): TextPositionSelector | undefined {
  const candidate = object(value);
  const basis = object(candidate?.["basis"]);
  const profile = text(basis?.["profile"]);
  const hash = text(basis?.["hash"]);
  const unit = candidate?.["unit"];
  const start = candidate?.["start"];
  const end = candidate?.["end"];
  if (
    !profile ||
    !hash ||
    unit !== "unicode_code_point" ||
    typeof start !== "number" ||
    typeof end !== "number"
  ) {
    return undefined;
  }
  return { basis: { profile, hash }, unit, start, end };
}

function pdfQuadPoints(value: unknown): PdfQuadPoints | undefined {
  if (Array.isArray(value) && value.length === 8 && value.every(Number.isFinite)) {
    return value as unknown as PdfQuadPoints;
  }
  return undefined;
}

function pdfSelector(value: unknown): PdfSelector | undefined {
  const candidate = object(value);
  const coordinateSpace = object(candidate?.["coordinate_space"]);
  const pageIndex = candidate?.["page_index"];
  const profile = text(coordinateSpace?.["profile"]);
  const box = coordinateSpace?.["box"];
  const origin = coordinateSpace?.["origin"];
  const quadPoints = Array.isArray(candidate?.["quad_points"])
    ? candidate["quad_points"]
        .map(pdfQuadPoints)
        .filter((quad): quad is PdfQuadPoints => quad !== undefined)
    : [];
  if (
    typeof pageIndex !== "number" ||
    !profile ||
    (box !== "crop" && box !== "media") ||
    (origin !== "bottom_left" && origin !== "top_left") ||
    quadPoints.length === 0
  ) {
    return undefined;
  }
  return {
    pageIndex,
    coordinateSpace: { profile, box, origin },
    quadPoints,
  };
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
  const textPosition = textPositionSelector(candidate["text_position"]);
  const pdf = pdfSelector(candidate["pdf"]);
  const cfi = text(object(candidate["epub"])?.["cfi"]);
  const html = htmlSelector(candidate["html"]);
  const result: AnnotationTarget = Object.assign(
    {},
    quote ? { quote } : {},
    textPosition ? { textPosition } : {},
    pdf ? { pdf } : {},
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
  const selectedDocument = documentTarget(fields["document"]);
  const locatorLabel = text(object(fields["locator"])?.["label"]);
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
    ...(selectedDocument ? { document: selectedDocument } : {}),
    ...(locatorLabel ? { locator: { label: locatorLabel } } : {}),
    ...(selectedTarget ? { target: selectedTarget } : {}),
  };
}

function targetFrontmatter(value: AnnotationTarget): JsonObject {
  return {
    ...(value.quote ? { quote: value.quote } : {}),
    ...(value.textPosition
      ? {
          text_position: {
            basis: value.textPosition.basis,
            unit: value.textPosition.unit,
            start: value.textPosition.start,
            end: value.textPosition.end,
          },
        }
      : {}),
    ...(value.pdf
      ? {
          pdf: {
            page_index: value.pdf.pageIndex,
            coordinate_space: value.pdf.coordinateSpace,
            quad_points: value.pdf.quadPoints.map((quad) => [...quad]),
          },
        }
      : {}),
    ...(value.epub ? { epub: value.epub } : {}),
    ...(value.html ? { html: value.html } : {}),
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
    ...(annotation.document
      ? {
          document: {
            file_id: annotation.document.fileId,
            file: annotation.document.file,
            revision: annotation.document.revision,
          },
        }
      : {}),
    ...(annotation.locator ? { locator: annotation.locator } : {}),
    ...(annotation.modifiedAt ? { modified_at: annotation.modifiedAt } : {}),
    ...(annotation.createdBy ? { created_by: annotation.createdBy } : {}),
    ...(annotation.motivation ? { motivation: annotation.motivation } : {}),
    ...(annotation.color ? { color: annotation.color } : {}),
    ...(annotation.target ? { target: targetFrontmatter(annotation.target) } : {}),
  };
}

export const connectCollectionId = collectionId;

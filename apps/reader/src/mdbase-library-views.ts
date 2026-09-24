/* eslint-disable max-lines */

import {
  columnLabel,
  isLibraryColumn,
  isPropertyKey,
  maximumColumnWidth,
  minimumColumnWidth,
  propertyKey,
  propertySortValue,
  propertyValue,
  type LibraryColumn,
  type PropertyLibraryColumn,
} from "./library-columns.js";
import {
  conditionToCel,
  matchesCondition,
  parseConditions,
  type FieldCondition,
  type FieldShape,
} from "./library-conditions.js";

import type { AnnotationViewConfiguration } from "./mdbase-annotation-views.js";
import type { SourceSummary } from "@mdbase-reader/core";

export { columnLabel };
export type { LibraryColumn };

export type LibraryPresentation = "table" | "cards";
export type LibrarySortField =
  "title" | "creator" | "published" | "status" | "saved" | "opened" | PropertyLibraryColumn;
export type LibrarySortDirection = "asc" | "desc";

export interface LibraryViewFilter {
  readonly query: string;
  readonly status: "all" | "inbox" | "queued" | "reading" | "finished" | "archived";
  readonly format: "all" | "pdf" | "epub" | "web" | "note";
  readonly tag: string;
  /** Conditions on any frontmatter field, all of which must hold. */
  readonly conditions: readonly FieldCondition[];
}

export interface LibraryViewConfiguration {
  readonly presentation: LibraryPresentation;
  readonly columns: readonly LibraryColumn[];
  /** Pixel widths by column, for columns the reader has resized. */
  readonly columnWidths: Readonly<Record<string, number>>;
  readonly sortField: LibrarySortField;
  readonly sortDirection: LibrarySortDirection;
  readonly filter: LibraryViewFilter;
}

export interface MdbaseLibraryView {
  readonly key: string;
  readonly path: string | null;
  readonly revision: string | null;
  readonly viewId: string;
  readonly name: string;
  readonly writable: boolean;
  readonly owned: boolean;
  readonly properties: readonly { readonly key: string; readonly label?: string }[];
  readonly configuration: LibraryViewConfiguration;
  /** Present when the view lists annotations rather than sources. */
  readonly annotations?: AnnotationViewConfiguration;
}

export interface ExecutedLibraryView {
  readonly sources: readonly SourceSummary[];
  readonly valuesByPath: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly totalCount: number;
}

export interface LibraryViewSaveRequest {
  readonly name: string;
  readonly configuration: LibraryViewConfiguration;
  /** Whether each condition's field holds lists, which decides its CEL; default scalar. */
  readonly fieldShapes?: Readonly<Record<string, FieldShape>>;
  readonly existing?: MdbaseLibraryView;
  /** Saves an annotations view instead; its source conditions take their shapes from `fieldShapes`. */
  readonly annotations?: AnnotationViewConfiguration;
}

export const defaultLibraryViewConfiguration: LibraryViewConfiguration = {
  presentation: "table",
  columns: ["title", "published", "annotations", "opened", "status"],
  columnWidths: {},
  sortField: "title",
  sortDirection: "asc",
  filter: { query: "", status: "all", format: "all", tag: "", conditions: [] },
};

export const defaultLibraryView: MdbaseLibraryView = {
  key: "all-sources",
  path: null,
  revision: null,
  viewId: "all-sources",
  name: "All sources",
  writable: false,
  owned: false,
  properties: [],
  configuration: defaultLibraryViewConfiguration,
};

export function libraryViewKey(path: string, viewId: string): string {
  return `${path}::${viewId}`;
}

export function parseLibraryViewKey(
  key: string,
): { readonly path: string; readonly viewId: string } | null {
  const separator = key.lastIndexOf("::");
  return separator > 0 ? { path: key.slice(0, separator), viewId: key.slice(separator + 2) } : null;
}

export function libraryViewConfiguration(
  presentation: Readonly<Record<string, unknown>> | undefined,
): LibraryViewConfiguration {
  const type = presentation?.["type"];
  const options = objectValue(presentation?.["options"]);
  const columns = Array.isArray(options["columns"])
    ? options["columns"].filter(isLibraryColumn)
    : defaultLibraryViewConfiguration.columns;
  const sortField = isSortField(options["sortField"])
    ? options["sortField"]
    : defaultLibraryViewConfiguration.sortField;
  const sortDirection = options["sortDirection"] === "asc" ? "asc" : "desc";
  const filter = objectValue(options["filter"]);
  return {
    presentation: type === "cards" ? "cards" : "table",
    columns: columns.length > 0 ? columns : defaultLibraryViewConfiguration.columns,
    columnWidths: parseColumnWidths(options["columnWidths"]),
    sortField,
    sortDirection,
    filter: {
      query: typeof filter["query"] === "string" ? filter["query"] : "",
      status: isStatus(filter["status"]) ? filter["status"] : "all",
      format: isFormat(filter["format"]) ? filter["format"] : "all",
      tag: typeof filter["tag"] === "string" ? filter["tag"] : "",
      conditions: parseConditions(filter["conditions"]),
    },
  };
}

export function buildLibraryViewDocument(request: LibraryViewSaveRequest): Promise<string> {
  const identifier = viewIdentifier(request.name);
  const configuration = request.configuration;
  const where = durableWhere(configuration.filter, request.fieldShapes ?? {});
  const frontmatter = {
    type: "view",
    id: `reader.library.${identifier}`,
    version: 1,
    name: request.name.trim(),
    description: "A saved mdbase Reader library view.",
    query: { types: ["reader-source"] },
    properties: Object.fromEntries(
      storedColumns(configuration.columns).map((column) => [
        columnSelection(column),
        { label: columnLabel(column) },
      ]),
    ),
    views: [
      {
        id: identifier,
        name: request.name.trim(),
        ...(where ? { where } : {}),
        select: storedColumns(configuration.columns).map(columnSelection),
        order_by: [orderBy(configuration.sortField, configuration.sortDirection)],
        presentation: {
          type: configuration.presentation,
          fallback: "table",
          mappings: {
            title: "title",
            creator: "authors",
            published: "published",
            status: "reading.status",
            tags: "tags",
          },
          options: {
            readerViewVersion: 1,
            columns: configuration.columns,
            columnWidths: configuration.columnWidths,
            sortField: configuration.sortField,
            sortDirection: configuration.sortDirection,
            // Search is retained as presentation state because canonical view
            // queries are deliberately case-sensitive and Reader search spans
            // normalized source, note, annotation, and document indexes.
            filter: configuration.filter,
          },
        },
      },
    ],
  };
  return viewDocument(frontmatter);
}

/** Serializes a view document; YAML is only needed when saving, so it loads on demand. */
export async function viewDocument(
  frontmatter: Readonly<Record<string, unknown>>,
): Promise<string> {
  const { stringify } = await import("yaml");
  return `---\n${stringify(frontmatter).trimEnd()}\n---\n\n`;
}

export function applyLibraryViewConfiguration(
  sources: readonly SourceSummary[],
  configuration: LibraryViewConfiguration,
): readonly SourceSummary[] {
  const query = configuration.filter.query.trim().toLocaleLowerCase();
  const tag = configuration.filter.tag.trim().toLocaleLowerCase();
  const filtered = sources.filter((source) => {
    if (
      configuration.filter.status !== "all" &&
      (source.readingStatus ?? "inbox") !== configuration.filter.status
    ) {
      return false;
    }
    if (
      configuration.filter.format !== "all" &&
      sourceFormat(source) !== configuration.filter.format
    ) {
      return false;
    }
    if (tag && !source.tags.some((candidate) => candidate.toLocaleLowerCase() === tag)) {
      return false;
    }
    if (
      !configuration.filter.conditions.every((condition) => matchesCondition(source, condition))
    ) {
      return false;
    }
    return (
      !query ||
      [source.title, ...source.creators, ...source.tags.map(String)]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query)
    );
  });
  return [...filtered].sort((left, right) => compareSources(left, right, configuration));
}

export function sourceFormat(source: SourceSummary): LibraryViewFilter["format"] {
  const media = source.documents[0]?.mediaType ?? "";
  if (media.includes("pdf")) {
    return "pdf";
  }
  if (media.includes("epub")) {
    return "epub";
  }
  if (media.includes("html")) {
    return "web";
  }
  return "note";
}

function durableWhere(
  filter: LibraryViewFilter,
  shapes: Readonly<Record<string, FieldShape>>,
): string | null {
  const terms: string[] = [];
  if (filter.status !== "all") {
    terms.push(`reading.status == ${JSON.stringify(filter.status)}`);
  }
  if (filter.format !== "all") {
    const mediaToken = filter.format === "web" ? "html" : filter.format;
    terms.push(
      filter.format === "note"
        ? "documents.size() == 0"
        : `documents.exists(document, document.media_type.contains(${JSON.stringify(mediaToken)}))`,
    );
  }
  if (filter.tag.trim()) {
    terms.push(`tags.contains(${JSON.stringify(filter.tag.trim())})`);
  }
  for (const condition of filter.conditions) {
    const clause = conditionToCel(condition, shapes[condition.key] ?? "scalar");
    if (clause) {
      terms.push(clause);
    }
  }
  return terms.length > 0 ? terms.join(" && ") : null;
}

function orderBy(
  field: LibrarySortField,
  direction: LibrarySortDirection,
): { field: string; direction: LibrarySortDirection } {
  const key = propertyKey(field);
  if (key !== null) {
    return { field: key, direction };
  }
  const fields: Record<Exclude<LibrarySortField, PropertyLibraryColumn>, string> = {
    title: "title",
    creator: "authors",
    published: "published",
    status: "reading.status",
    saved: "saved_at",
    opened: "reading.last_opened_at",
  };
  return { field: fields[field as Exclude<LibrarySortField, PropertyLibraryColumn>], direction };
}

/** Annotation counts are derived from annotation records, not stored on the source. */
function storedColumns(columns: readonly LibraryColumn[]): readonly LibraryColumn[] {
  return columns.filter((column) => column !== "annotations");
}

function columnSelection(column: LibraryColumn): string {
  switch (column) {
    case "creator":
      return "authors";
    case "status":
      return "reading.status";
    case "format":
      return "kind";
    case "opened":
      return "reading.last_opened_at";
    default:
      return propertyKey(column) ?? column;
  }
}

function compareSources(
  left: SourceSummary,
  right: SourceSummary,
  configuration: LibraryViewConfiguration,
): number {
  const key = propertyKey(configuration.sortField);
  const value = (source: SourceSummary): string | number => {
    if (key !== null) {
      return propertySortValue(propertyValue(source, key));
    }
    switch (configuration.sortField) {
      case "title":
        return source.title;
      case "creator":
        return source.creators[0] ?? "";
      case "published":
        return Number(source.published ?? 0);
      case "status":
        return source.readingStatus ?? "inbox";
      case "saved":
        return source.id;
      case "opened":
        return source.reading?.lastOpenedAt ?? "";
      default:
        return "";
    }
  };
  const a = value(left);
  const b = value(right);
  const comparison =
    typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
  return configuration.sortDirection === "asc" ? comparison : -comparison;
}

function viewIdentifier(name: string): string {
  const value = name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 72);
  return /^[a-z]/u.test(value) ? value : `view-${value || "library"}`;
}

function objectValue(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function isSortField(value: unknown): value is LibrarySortField {
  const key = propertyKey(String(value));
  return key !== null
    ? isPropertyKey(key)
    : ["title", "creator", "published", "status", "saved", "opened"].includes(String(value));
}

function parseColumnWidths(value: unknown): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.entries(objectValue(value)).flatMap(([column, width]) =>
      isLibraryColumn(column) && typeof width === "number" && Number.isFinite(width)
        ? [[column, Math.round(Math.min(maximumColumnWidth, Math.max(minimumColumnWidth, width)))]]
        : [],
    ),
  );
}

function isStatus(value: unknown): value is LibraryViewFilter["status"] {
  return ["all", "inbox", "queued", "reading", "finished", "archived"].includes(String(value));
}

function isFormat(value: unknown): value is LibraryViewFilter["format"] {
  return ["all", "pdf", "epub", "web", "note"].includes(String(value));
}

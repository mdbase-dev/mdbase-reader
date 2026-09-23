/* eslint-disable max-lines */
import { stringify as stringifyYaml } from "yaml";

import type { SourceSummary } from "@mdbase-reader/core";

export type LibraryPresentation = "table" | "cards";
export type LibrarySortField = "title" | "creator" | "published" | "status" | "saved";
export type LibrarySortDirection = "asc" | "desc";
export type LibraryColumn = "title" | "creator" | "published" | "status" | "format" | "tags";

export interface LibraryViewFilter {
  readonly query: string;
  readonly status: "all" | "inbox" | "queued" | "reading" | "finished" | "archived";
  readonly format: "all" | "pdf" | "epub" | "web" | "note";
  readonly tag: string;
}

export interface LibraryViewConfiguration {
  readonly presentation: LibraryPresentation;
  readonly columns: readonly LibraryColumn[];
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
}

export interface ExecutedLibraryView {
  readonly sources: readonly SourceSummary[];
  readonly valuesByPath: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly totalCount: number;
}

export interface LibraryViewSaveRequest {
  readonly name: string;
  readonly configuration: LibraryViewConfiguration;
  readonly existing?: MdbaseLibraryView;
}

export const defaultLibraryViewConfiguration: LibraryViewConfiguration = {
  presentation: "table",
  columns: ["title", "creator", "status", "published"],
  sortField: "title",
  sortDirection: "asc",
  filter: { query: "", status: "all", format: "all", tag: "" },
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
    sortField,
    sortDirection,
    filter: {
      query: typeof filter["query"] === "string" ? filter["query"] : "",
      status: isStatus(filter["status"]) ? filter["status"] : "all",
      format: isFormat(filter["format"]) ? filter["format"] : "all",
      tag: typeof filter["tag"] === "string" ? filter["tag"] : "",
    },
  };
}

export function isReaderLibraryPresentation(
  presentation: Readonly<Record<string, unknown>> | undefined,
): boolean {
  return objectValue(presentation?.["options"])["readerViewVersion"] === 1;
}

export function buildLibraryViewDocument(request: LibraryViewSaveRequest): string {
  const identifier = viewIdentifier(request.name);
  const configuration = request.configuration;
  const where = durableWhere(configuration.filter);
  const frontmatter = {
    type: "view",
    id: `reader.library.${identifier}`,
    version: 1,
    name: request.name.trim(),
    description: "A saved mdbase Reader library view.",
    query: { types: ["reader-source"] },
    properties: Object.fromEntries(
      configuration.columns.map((column) => [
        columnSelection(column),
        { label: columnLabel(column) },
      ]),
    ),
    views: [
      {
        id: identifier,
        name: request.name.trim(),
        ...(where ? { where } : {}),
        select: configuration.columns.map(columnSelection),
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
  return `---\n${stringifyYaml(frontmatter).trimEnd()}\n---\n\n`;
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

function durableWhere(filter: LibraryViewFilter): string | null {
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
  return terms.length > 0 ? terms.join(" && ") : null;
}

function orderBy(
  field: LibrarySortField,
  direction: LibrarySortDirection,
): { field: string; direction: LibrarySortDirection } {
  const fields: Record<LibrarySortField, string> = {
    title: "title",
    creator: "authors",
    published: "published",
    status: "reading.status",
    saved: "saved_at",
  };
  return { field: fields[field], direction };
}

function columnSelection(column: LibraryColumn): string {
  return column === "creator"
    ? "authors"
    : column === "status"
      ? "reading.status"
      : column === "format"
        ? "kind"
        : column;
}

export function columnLabel(column: LibraryColumn): string {
  return {
    title: "Title",
    creator: "Creator",
    published: "Published",
    status: "Status",
    format: "Format",
    tags: "Tags",
  }[column];
}

function compareSources(
  left: SourceSummary,
  right: SourceSummary,
  configuration: LibraryViewConfiguration,
): number {
  const value = (source: SourceSummary): string | number => {
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

function isLibraryColumn(value: unknown): value is LibraryColumn {
  return ["title", "creator", "published", "status", "format", "tags"].includes(String(value));
}

function isSortField(value: unknown): value is LibrarySortField {
  return ["title", "creator", "published", "status", "saved"].includes(String(value));
}

function isStatus(value: unknown): value is LibraryViewFilter["status"] {
  return ["all", "inbox", "queued", "reading", "finished", "archived"].includes(String(value));
}

function isFormat(value: unknown): value is LibraryViewFilter["format"] {
  return ["all", "pdf", "epub", "web", "note"].includes(String(value));
}

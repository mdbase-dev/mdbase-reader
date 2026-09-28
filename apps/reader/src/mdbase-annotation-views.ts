import {
  annotationColumnLabel,
  isAnnotationColumn,
  isAnnotationSortField,
  type AnnotationColumn,
  type AnnotationSortDirection,
  type AnnotationSortField,
} from "./annotation-columns.js";
import { emptyAnnotationFilter, type AnnotationFilter } from "./annotation-overview.js";
import { maximumColumnWidth, minimumColumnWidth } from "./library-columns.js";
import { conditionToCel, parseConditions, type FieldShape } from "./library-conditions.js";

import type { JsonObject } from "@mdbase-reader/connect";

/** An annotations view as the reader arranged it: columns, sort and filters. */
export interface AnnotationViewConfiguration {
  readonly columns: readonly AnnotationColumn[];
  /** Pixel widths by column, for columns the reader has resized. */
  readonly columnWidths: Readonly<Record<string, number>>;
  readonly sortField: AnnotationSortField;
  readonly sortDirection: AnnotationSortDirection;
  readonly filter: AnnotationFilter;
}

/** The parts of an annotations view arranged by hand, remembered on this device until saved. */
export type AnnotationLayout = Omit<AnnotationViewConfiguration, "filter">;

export const defaultAnnotationViewConfiguration: AnnotationViewConfiguration = {
  columns: ["passage", "source", "type", "tags", "location", "created"],
  columnWidths: {},
  sortField: "created",
  sortDirection: "desc",
  filter: emptyAnnotationFilter,
};

export interface AnnotationViewSaveRequest {
  readonly name: string;
  readonly configuration: AnnotationViewConfiguration;
  /** Whether each source condition's field holds lists, which decides its CEL; default scalar. */
  readonly fieldShapes?: Readonly<Record<string, FieldShape>>;
}

/** What a Reader-owned saved view lists: sources, annotations, or one source's annotations. */
export type ReaderViewKind = "sources" | "annotations" | "source-annotations";

// Annotations reach their source's fields through the `source` link (mdbase links profile).
const sourceRecord = "source.asFile()";
// Optional selection keeps a broken link or a missing field null instead of an
// evaluation error.
const projections = {
  source_title: `${sourceRecord}.?title.orValue(null)`,
  source_authors: `${sourceRecord}.?authors.orValue(null)`,
} as const;

/** The kind of a Reader-owned view, or null for views other apps own. */
export function readerViewKind(
  presentation: Readonly<Record<string, unknown>> | undefined,
): ReaderViewKind | null {
  const options = objectValue(presentation?.["options"]);
  if (options["readerViewVersion"] !== 1) {
    return null;
  }
  const kind = options["readerViewKind"];
  return kind === "annotations" || kind === "source-annotations" ? kind : "sources";
}

export function annotationViewConfiguration(
  presentation: Readonly<Record<string, unknown>> | undefined,
): AnnotationViewConfiguration {
  const options = objectValue(presentation?.["options"]);
  const defaults = defaultAnnotationViewConfiguration;
  const columns = Array.isArray(options["columns"])
    ? options["columns"].filter(isAnnotationColumn)
    : [];
  const filter = objectValue(options["filter"]);
  const type = filter["type"];
  return {
    columns: columns.length > 0 ? [...new Set(columns)] : defaults.columns,
    columnWidths: parseColumnWidths(options["columnWidths"]),
    sortField: isAnnotationSortField(options["sortField"])
      ? options["sortField"]
      : defaults.sortField,
    sortDirection: options["sortDirection"] === "asc" ? "asc" : "desc",
    filter: {
      query: typeof filter["query"] === "string" ? filter["query"] : "",
      type:
        type === "highlight" || type === "note" || type === "area" || type === "bookmark"
          ? type
          : "all",
      tag: typeof filter["tag"] === "string" ? filter["tag"] : "",
      sourceConditions: parseConditions(filter["sourceConditions"]),
    },
  };
}

/**
 * The view's filters as CEL. Conditions on the source read it through its link, and only apply
 * when that link resolves, as in Reader. Search stays presentation state, like a library view's.
 */
export function annotationViewWhere(
  filter: AnnotationFilter,
  shapes: Readonly<Record<string, FieldShape>> = {},
): string | null {
  const terms: string[] = [];
  if (filter.type !== "all") {
    terms.push(`annotation_type == ${JSON.stringify(filter.type)}`);
  }
  const tag = conditionToCel({ key: "tags", operator: "is", value: filter.tag }, "list");
  if (tag) {
    terms.push(tag);
  }
  const sourceTerms = filter.sourceConditions.flatMap((condition) => {
    const clause = conditionToCel(condition, shapes[condition.key] ?? "scalar", sourceRecord);
    return clause ? [clause] : [];
  });
  if (sourceTerms.length > 0) {
    terms.push(`${sourceRecord} != null && ${sourceTerms.join(" && ")}`);
  }
  return terms.length > 0 ? terms.join(" && ") : null;
}

export function buildAnnotationView(request: AnnotationViewSaveRequest): JsonObject {
  const identifier = viewIdentifier(request.name);
  const { configuration } = request;
  const where = annotationViewWhere(configuration.filter, request.fieldShapes);
  const selected = configuration.columns.flatMap((column) => {
    const field = columnSelection(column);
    return field ? [{ column, field }] : [];
  });
  return {
    type: "view",
    id: `reader.annotations.${identifier}`,
    version: 1,
    name: request.name.trim(),
    description: "A saved mdbase Reader annotations view.",
    query: {
      types: ["reader-annotation"],
      projections: Object.fromEntries(
        Object.entries(projections).map(([name, expr]) => [name, { expr }]),
      ),
    },
    properties: Object.fromEntries(
      selected.map(({ column, field }) => [field, { label: annotationColumnLabel(column) }]),
    ),
    views: [
      {
        id: identifier,
        name: request.name.trim(),
        ...(where ? { where } : {}),
        select: selected.map(({ field }) => field),
        order_by: orderBy(configuration.sortField, configuration.sortDirection),
        presentation: {
          type: "table",
          fallback: "table",
          options: {
            readerViewVersion: 1,
            readerViewKind: "annotations",
            columns: configuration.columns,
            columnWidths: configuration.columnWidths,
            sortField: configuration.sortField,
            sortDirection: configuration.sortDirection,
            filter: configuration.filter,
          },
        },
      },
    ],
  };
}

export const sourceAnnotationsViewName = "Annotations for this source";

/**
 * One view listing the annotations of whichever source it runs against: embed it in a source
 * note, or run it with a source as its context from any mdbase tool.
 */
export function buildSourceAnnotationsView(): JsonObject {
  return {
    type: "view",
    id: "reader.annotations.for-source",
    version: 1,
    name: sourceAnnotationsViewName,
    description:
      "The annotations of the source this view runs against. Run it with a source as its context.",
    query: { types: ["reader-annotation"] },
    properties: {
      "target.quote.exact": { label: "Passage" },
      annotation_type: { label: "Type" },
      tags: { label: "Tags" },
      "locator.label": { label: "Location" },
      created_at: { label: "Created" },
    },
    views: [
      {
        id: "for-source",
        name: sourceAnnotationsViewName,
        context: { this: { on_missing: "error", types: ["reader-source"] } },
        where: `${sourceRecord}.?file.?path.orValue(null) == this.file.path`,
        select: ["target.quote.exact", "annotation_type", "tags", "locator.label", "created_at"],
        order_by: [{ field: "created_at", direction: "asc" }],
        presentation: {
          type: "table",
          fallback: "table",
          options: { readerViewVersion: 1, readerViewKind: "source-annotations" },
        },
      },
    ],
  };
}

function columnSelection(column: AnnotationColumn): string | null {
  switch (column) {
    case "passage":
      return "target.quote.exact";
    case "source":
      return "projection.source_title";
    case "creator":
      return "projection.source_authors";
    case "type":
      return "annotation_type";
    case "tags":
      return "tags";
    case "location":
      return "locator.label";
    default:
      return "created_at";
  }
}

function orderBy(
  field: AnnotationSortField,
  direction: AnnotationSortDirection,
): readonly { readonly field: string; readonly direction: AnnotationSortDirection }[] {
  if (field === "created") {
    return [{ field: "created_at", direction }];
  }
  // Within one source or type, annotations keep reading order, as in Reader.
  return [
    { field: field === "source" ? "projection.source_title" : "annotation_type", direction },
    { field: "created_at", direction: "asc" },
  ];
}

function viewIdentifier(name: string): string {
  const value = name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 72);
  return /^[a-z]/u.test(value) ? value : `view-${value || "annotations"}`;
}

function objectValue(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function parseColumnWidths(value: unknown): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.entries(objectValue(value)).flatMap(([column, width]) =>
      isAnnotationColumn(column) && typeof width === "number" && Number.isFinite(width)
        ? [[column, Math.round(Math.min(maximumColumnWidth, Math.max(minimumColumnWidth, width)))]]
        : [],
    ),
  );
}

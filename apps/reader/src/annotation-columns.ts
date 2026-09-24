/** Columns the annotations view can show. */
export const annotationColumns = [
  "passage",
  "source",
  "creator",
  "type",
  "tags",
  "location",
  "created",
] as const;
export type AnnotationColumn = (typeof annotationColumns)[number];

/** Columns an annotation list can be ordered by, in the view and in a saved view's `order_by`. */
export type AnnotationSortField = "created" | "source" | "type";
export type AnnotationSortDirection = "asc" | "desc";

export function isAnnotationColumn(value: unknown): value is AnnotationColumn {
  return (annotationColumns as readonly unknown[]).includes(value);
}

export function isAnnotationSortField(value: unknown): value is AnnotationSortField {
  return value === "created" || value === "source" || value === "type";
}

const labels: Record<AnnotationColumn, string> = {
  passage: "Passage",
  source: "Source",
  creator: "Creator",
  type: "Type",
  tags: "Tags",
  location: "Location",
  created: "Created",
};

export function annotationColumnLabel(column: AnnotationColumn): string {
  return labels[column];
}

const widths: Record<AnnotationColumn, number> = {
  passage: 420,
  source: 240,
  creator: 180,
  type: 96,
  tags: 150,
  location: 130,
  created: 104,
};

export function defaultAnnotationColumnWidth(column: AnnotationColumn): number {
  return widths[column];
}

/** The sort a column's header applies, if it has one. */
export function annotationSortFieldFor(column: AnnotationColumn): AnnotationSortField | null {
  return isAnnotationSortField(column) ? column : null;
}

/** Dates read newest first; text reads A to Z. */
export function firstAnnotationSortDirection(field: AnnotationSortField): AnnotationSortDirection {
  return field === "created" ? "desc" : "asc";
}

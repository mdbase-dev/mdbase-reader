import type { SourceSummary } from "@mdbase-reader/core";

/** Columns Reader knows how to present. */
export const builtinLibraryColumns = [
  "title",
  "creator",
  "published",
  "annotations",
  "opened",
  "status",
  "format",
  "tags",
] as const;
export type BuiltinLibraryColumn = (typeof builtinLibraryColumns)[number];

/** Any frontmatter field, named by its dotted path, e.g. `property:course` or `property:csl.volume`. */
export type PropertyLibraryColumn = `property:${string}`;
export type LibraryColumn = BuiltinLibraryColumn | PropertyLibraryColumn;

const propertyPrefix = "property:";
const propertyKeyPattern = /^[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*$/u;

export function propertyColumn(key: string): PropertyLibraryColumn {
  return `${propertyPrefix}${key}`;
}

export function propertyKey(column: string): string | null {
  return column.startsWith(propertyPrefix) ? column.slice(propertyPrefix.length) : null;
}

// Built-in columns that each show one frontmatter field, so they edit like property columns.
const builtinFieldKeys: Partial<Record<BuiltinLibraryColumn, string>> = {
  title: "title",
  creator: "authors",
  published: "published",
};

/** The frontmatter field a column shows, when it shows exactly one. */
export function columnFieldKey(column: LibraryColumn): string | null {
  return propertyKey(column) ?? builtinFieldKeys[column as BuiltinLibraryColumn] ?? null;
}

export function isPropertyKey(key: string): boolean {
  return propertyKeyPattern.test(key);
}

export function isLibraryColumn(value: unknown): value is LibraryColumn {
  if (typeof value !== "string") {
    return false;
  }
  const key = propertyKey(value);
  return key === null
    ? (builtinLibraryColumns as readonly string[]).includes(value)
    : isPropertyKey(key);
}

const builtinLabels: Record<BuiltinLibraryColumn, string> = {
  title: "Title",
  creator: "Creator",
  published: "Published",
  status: "Status",
  format: "Format",
  tags: "Tags",
  annotations: "Annotations",
  opened: "Last opened",
};

/** "reading.started_at" → "Started at"; a view's own label wins when it has one. */
export function columnLabel(
  column: LibraryColumn,
  properties: readonly { readonly key: string; readonly label?: string }[] = [],
): string {
  const key = propertyKey(column);
  if (key === null) {
    return builtinLabels[column as BuiltinLibraryColumn];
  }
  const declared = properties.find((property) => property.key === key)?.label;
  if (declared) {
    return declared;
  }
  const last = key.split(".").at(-1) ?? key;
  const words = last.replace(/[_-]+/gu, " ").trim();
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}

const defaultWidths: Record<BuiltinLibraryColumn, number> = {
  title: 380,
  creator: 190,
  published: 104,
  annotations: 116,
  opened: 124,
  status: 136,
  format: 88,
  tags: 190,
};

export const minimumColumnWidth = 64;
export const maximumColumnWidth = 900;

export function defaultColumnWidth(column: LibraryColumn): number {
  return propertyKey(column) === null ? defaultWidths[column as BuiltinLibraryColumn] : 160;
}

/** Reads a dotted path from a source's frontmatter, preferring values a saved view selected. */
export function propertyValue(
  source: SourceSummary,
  key: string,
  selected?: Readonly<Record<string, unknown>>,
): unknown {
  if (selected && key in selected) {
    return selected[key];
  }
  let current: unknown = source.properties;
  for (const part of key.split(".")) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Readonly<Record<string, unknown>>)[part];
  }
  return current;
}

/** A short, readable rendering of an arbitrary frontmatter value. */
export function formatPropertyValue(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map(formatPropertyValue).filter(Boolean).join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    return value.toLocaleString();
  }
  if (typeof value === "string") {
    // Wikilinks read as their alias or target, not their brackets.
    const link = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/u.exec(value.trim());
    if (link) {
      return (link[2] ?? link[1]?.split("/").at(-1) ?? value).trim();
    }
    return value;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return typeof value === "bigint" ? value.toString() : "";
}

/** A comparable key: numbers stay numeric, everything else compares as text. */
export function propertySortValue(value: unknown): string | number {
  if (typeof value === "number") {
    return value;
  }
  return formatPropertyValue(value).toLocaleLowerCase();
}

// Contract fields Reader already presents, or that are structural rather than descriptive.
const hiddenPropertyKeys = new Set([
  "id",
  "title",
  "type",
  "authors",
  "tags",
  "documents",
  "csl",
  "reading",
  "published",
]);

/**
 * Fields worth offering as columns: those a view declares, then the top-level fields present in
 * the library, most common first.
 */
export function discoverPropertyKeys(
  sources: readonly SourceSummary[],
  declared: readonly { readonly key: string }[] = [],
  sampleSize = 500,
): readonly string[] {
  const counts = new Map<string, number>();
  for (const source of sources.slice(0, sampleSize)) {
    for (const [key, value] of Object.entries(source.properties ?? {})) {
      if (!hiddenPropertyKeys.has(key) && isPropertyKey(key) && value !== null && value !== "") {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  const discovered = [...counts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key]) => key);
  const keys = [...declared.map(({ key }) => key).filter(isPropertyKey), ...discovered];
  return [...new Set(keys)];
}

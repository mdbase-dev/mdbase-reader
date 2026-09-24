import { annotationBodyContent } from "./annotation-body-content.js";
import { matchesCondition, type FieldCondition } from "./library-conditions.js";

import type { AnnotationSortDirection, AnnotationSortField } from "./annotation-columns.js";
import type { Annotation, SourceSummary } from "@mdbase-reader/core";

/** One annotation with the source it belongs to, as the annotations view lists it. */
export interface AnnotationEntry {
  readonly annotation: Annotation;
  readonly source: SourceSummary | null;
  /** The quoted passage, if any. */
  readonly quote: string;
  /** The reader's own words. */
  readonly note: string;
}

export interface AnnotationFilter {
  readonly query: string;
  readonly type: "all" | "highlight" | "note" | "area";
  readonly tag: string;
  /** Conditions on the annotation's source, e.g. `course is "…"`. */
  readonly sourceConditions: readonly FieldCondition[];
}

export const emptyAnnotationFilter: AnnotationFilter = {
  query: "",
  type: "all",
  tag: "",
  sourceConditions: [],
};

export function annotationEntries(
  annotations: readonly Annotation[],
  sources: readonly SourceSummary[],
): readonly AnnotationEntry[] {
  const byId = new Map(sources.map((source) => [source.id, source]));
  return annotations.map((annotation) => {
    const content = annotationBodyContent(annotation.body);
    return {
      annotation,
      source: byId.get(annotation.sourceId) ?? null,
      quote: content.quote ?? annotation.target?.quote?.exact ?? "",
      note: content.note,
    };
  });
}

export function filterAnnotationEntries(
  entries: readonly AnnotationEntry[],
  filter: AnnotationFilter,
): readonly AnnotationEntry[] {
  const query = filter.query.trim().toLocaleLowerCase();
  const tag = filter.tag.trim().toLocaleLowerCase();
  return entries.filter(({ annotation, source, quote, note }) => {
    if (filter.type !== "all" && annotation.annotationType !== filter.type) {
      return false;
    }
    if (tag && !annotation.tags.some((candidate) => candidate.toLocaleLowerCase() === tag)) {
      return false;
    }
    if (
      filter.sourceConditions.length > 0 &&
      (!source ||
        !filter.sourceConditions.every((condition) => matchesCondition(source, condition)))
    ) {
      return false;
    }
    return (
      !query ||
      [quote, note, source?.title ?? "", ...(source?.creators ?? []), ...annotation.tags]
        .join("\n")
        .toLocaleLowerCase()
        .includes(query)
    );
  });
}

export function sortAnnotationEntries(
  entries: readonly AnnotationEntry[],
  field: AnnotationSortField,
  direction: AnnotationSortDirection,
): readonly AnnotationEntry[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...entries].sort((left, right) => {
    const created = left.annotation.createdAt.localeCompare(right.annotation.createdAt);
    if (field === "created") {
      return sign * created;
    }
    const primary =
      field === "source"
        ? (left.source?.title ?? "").localeCompare(right.source?.title ?? "")
        : left.annotation.annotationType.localeCompare(right.annotation.annotationType);
    // Within one source or type, annotations keep reading order.
    return sign * primary || created;
  });
}

/** Tags used across the annotations, most common first, for the tag filter. */
export function annotationTags(entries: readonly AnnotationEntry[]): readonly string[] {
  const counts = new Map<string, number>();
  for (const { annotation } of entries) {
    for (const tag of annotation.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

/**
 * Selected annotations as Markdown for writing: grouped by source, each quote as a blockquote
 * followed by the reader's note, with a wikilink back to the annotation record.
 */
export function annotationsToMarkdown(entries: readonly AnnotationEntry[]): string {
  const groups = new Map<string, AnnotationEntry[]>();
  for (const entry of entries) {
    const key = entry.source?.id ?? entry.annotation.sourceId;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.values()]
    .map((group) => {
      const source = group[0]?.source;
      const heading = source
        ? `## ${source.title}${source.creators.length ? ` — ${source.creators.join(", ")}` : ""}`
        : "## Unknown source";
      const items = group.map(({ annotation, quote, note }) => {
        const lines: string[] = [];
        if (quote) {
          lines.push(...quote.split("\n").map((line) => `> ${line}`));
        }
        if (note) {
          lines.push(...(quote ? [""] : []), note);
        }
        const place = annotation.locator?.label ? ` (${annotation.locator.label})` : "";
        const link = annotation.path ? `[[${annotation.path.replace(/\.md$/u, "")}|↗]]` : "";
        lines.push("", `${link}${place}`.trim());
        return lines.join("\n").trim();
      });
      return [heading, ...items].join("\n\n");
    })
    .join("\n\n");
}

import { t } from "@lingui/core/macro";

import { annotationBodyContent } from "./annotation-body-content.js";
import { annotationLocationLabel } from "./passage-labels.js";

import type { Annotation, SourceSummary } from "@mdbase-reader/core";

/** One annotation with the source it belongs to and its text split into quote and note. */
export interface AnnotationEntry {
  readonly annotation: Annotation;
  readonly source: SourceSummary | null;
  /** The quoted passage, if any. */
  readonly quote: string;
  /** The reader's own words. */
  readonly note: string;
}

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

/**
 * Annotations as Markdown for writing: grouped by source, each quote as a blockquote
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
        : `## ${t`Unknown source`}`;
      const items = group.map(({ annotation, quote, note }) => {
        const lines: string[] = [];
        if (quote) {
          lines.push(...quote.split("\n").map((line) => `> ${line}`));
        }
        if (note) {
          lines.push(...(quote ? [""] : []), note);
        }
        const location = annotationLocationLabel(annotation);
        const place = location ? ` (${location})` : "";
        const link = annotation.path ? `[[${annotation.path.replace(/\.md$/u, "")}|↗]]` : "";
        lines.push("", `${link}${place}`.trim());
        return lines.join("\n").trim();
      });
      return [heading, ...items].join("\n\n");
    })
    .join("\n\n");
}

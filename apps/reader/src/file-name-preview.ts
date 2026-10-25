import {
  annotationNamePreview,
  sourceNoteNamePreview,
  type SourceNameFacts,
  type SourceNameParent,
} from "@mdbase-reader/connect";
import { authorYearFromCsl, authorYearFromMetadata } from "@mdbase-reader/core";

import type { Annotation, SourceSummary } from "@mdbase-reader/core";

/** One preview line: what a template would name an item like one of the user's own. */
export interface FileNamePreviewRow {
  readonly key: string;
  /** What the item is, as the user knows it: a title or a quote. */
  readonly label: string;
  /** The first path Reader would try. */
  readonly path: string;
  /** True when the template gave nothing usable, so Reader's own name is shown. */
  readonly usedDefault: boolean;
}

/** What a source in the library would be named by `template` if it were added now. */
export async function sourcePreviewRows(
  template: string,
  sources: readonly SourceSummary[],
  library: readonly SourceSummary[],
): Promise<readonly FileNamePreviewRow[]> {
  return Promise.all(
    sources.map(async (source) => {
      const parent = source.partOf
        ? library.find((candidate) => candidate.id === source.partOf)
        : undefined;
      const preview = await sourceNoteNamePreview(
        template,
        sourceNameFacts(source),
        parent ? sourceNameParent(parent) : undefined,
      );
      return {
        key: source.id,
        label: source.title || source.id,
        path: preview.paths[0] ?? source.path,
        usedDefault: preview.usedDefault,
      };
    }),
  );
}

/** What an existing annotation would be named by `template` if it were made now. */
export async function annotationPreviewRows(
  template: string,
  annotations: readonly Annotation[],
): Promise<readonly FileNamePreviewRow[]> {
  return Promise.all(
    annotations.map(async (annotation) => {
      const preview = await annotationNamePreview(template, annotation);
      return {
        key: annotation.id,
        label: annotationLabel(annotation),
        path: preview.paths[0] ?? `annotations/${annotation.id}.md`,
        usedDefault: preview.usedDefault,
      };
    }),
  );
}

export function sourceNameFacts(source: SourceSummary): SourceNameFacts {
  const published = source.published === undefined ? undefined : String(source.published);
  const savedAt = source.properties?.["saved_at"];
  return {
    id: source.id,
    title: source.title,
    creators: source.creators,
    authorYear: source.citation
      ? authorYearFromCsl(source.citation)
      : authorYearFromMetadata({ authors: source.creators, ...(published ? { published } : {}) }),
    kind: source.kind,
    published: source.published,
    site: source.site,
    citation: source.citation,
    savedAt: typeof savedAt === "string" ? savedAt : undefined,
  };
}

function sourceNameParent(parent: SourceSummary): SourceNameParent {
  return {
    title: parent.title,
    path: parent.path,
    creators: parent.creators,
    published: parent.published,
    citation: parent.citation,
  };
}

function annotationLabel(annotation: Annotation): string {
  const quote = annotation.target?.quote?.exact.replace(/\s+/gu, " ").trim();
  if (quote) {
    return quote.length > 80 ? `“${quote.slice(0, 79)}…”` : `“${quote}”`;
  }
  const body = annotation.body.replace(/\s+/gu, " ").trim();
  return body ? body.slice(0, 80) : `A ${annotation.annotationType}`;
}

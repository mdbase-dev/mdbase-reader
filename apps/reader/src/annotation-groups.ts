import { hasPassageAnchor } from "./annotation-anchor.js";
import { annotationLocationLabel } from "./passage-labels.js";

import type { Annotation, SourceId, SourceSummary } from "@mdbase-reader/core";

/** Format names say which document, not where in it, so they do not make useful headings. */
const documentLabels = new Set(["PDF", "EPUB", "Web page"]);

export const unlocatedGroupLabel = "Not linked to a passage";
export const outsideChapterGroupNote = "Outside the chapter’s pages";

export interface AnnotationGroupHeading {
  /** The section, chapter or page shared by the cards below. */
  readonly label: string;
  /** Named only when the group belongs to a source other than the open one. */
  readonly source: { readonly title: string; readonly summary?: SourceSummary } | null;
  /**
   * True on the first heading of a run of cards that belong to a chapter but lie outside its
   * pages, so the run is noted once rather than on every card.
   */
  readonly outsideChapter?: boolean;
}

/** A PDF annotation owned by a chapter source but placed outside that chapter's page range. */
export function annotationOutsideChapter(
  annotation: Annotation,
  sources: readonly SourceSummary[],
): boolean {
  const owner = sources.find(({ id }) => id === annotation.sourceId);
  const range = owner?.documents.find(
    (document) =>
      document.fileId === annotation.document?.fileId &&
      document.revision === annotation.document.revision,
  )?.range;
  const page =
    annotation.target?.pdf?.pageIndex ??
    (annotation.target?.position?.kind === "pdf"
      ? annotation.target.position.pageIndex
      : undefined);
  return range?.kind === "pages" && page !== undefined && (page < range.start || page > range.end);
}

/** An annotation saved to another source than the open one names that source. */
export function annotationFromOtherSource(
  annotation: Annotation,
  currentSourceId: SourceId | undefined,
): boolean {
  return currentSourceId !== undefined && annotation.sourceId !== currentSourceId;
}

function groupLocation(annotation: Annotation): string | undefined {
  const label = annotationLocationLabel(annotation);
  return label && !documentLabels.has(label) ? label : undefined;
}

/**
 * Headings for consecutive runs of cards in document order, indexed like `results`; `null` where
 * a card continues the group above it. Location headings replace the label on each card, and a
 * run from another source names that source once instead of on every card. A document with no
 * usable locations gets no headings at all. A run outside its chapter's pages is noted on its
 * first heading.
 */
export function annotationGroupHeadings(
  results: readonly Annotation[],
  currentSourceId: SourceId | undefined,
  sources: readonly SourceSummary[] = [],
): readonly (AnnotationGroupHeading | null)[] {
  let previous: string | null = null;
  let headed = false;
  let outsideRun = false;
  let outsideNoted = false;
  return results.map((annotation) => {
    const outside = annotationOutsideChapter(annotation, sources);
    if (!outside || !outsideRun) {
      outsideNoted = false;
    }
    outsideRun = outside;
    const group = annotationGroup(annotation, currentSourceId, outside);
    const starts = group.key !== previous;
    previous = group.key;
    // Once any heading is shown, unlocated cards need their own so they do not join the last page.
    if (!starts || !(group.located || group.other || headed)) {
      return null;
    }
    headed = true;
    const heading = {
      label: group.label,
      source: group.other ? groupSource(annotation, sources) : null,
    };
    if (outside && !outsideNoted) {
      outsideNoted = true;
      return { ...heading, outsideChapter: true };
    }
    return heading;
  });
}

function annotationGroup(
  annotation: Annotation,
  currentSourceId: SourceId | undefined,
  outside: boolean,
): { key: string; label: string; located: boolean; other: boolean } {
  const location = groupLocation(annotation);
  const linked = hasPassageAnchor(annotation.target);
  const other = annotationFromOtherSource(annotation, currentSourceId);
  const place = location ?? (linked ? "\u0001" : "");
  return {
    key: `${other ? annotation.sourceId : ""}\u0000${place}${outside ? "\u0000outside" : ""}`,
    label:
      location ??
      (linked ? (annotationLocationLabel(annotation) ?? "Document") : unlocatedGroupLabel),
    located: location !== undefined,
    other,
  };
}

function groupSource(
  annotation: Annotation,
  sources: readonly SourceSummary[],
): NonNullable<AnnotationGroupHeading["source"]> {
  const summary = sources.find(({ id }) => id === annotation.sourceId);
  return summary ? { title: summary.title, summary } : { title: annotation.source };
}

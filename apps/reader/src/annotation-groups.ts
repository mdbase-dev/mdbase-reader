import { hasPassageAnchor } from "./annotation-anchor.js";
import { annotationLocationLabel } from "./passage-labels.js";

import type { Annotation, SourceId, SourceSummary } from "@mdbase-reader/core";

/** Format names say which document, not where in it, so they do not make useful headings. */
const documentLabels = new Set(["PDF", "EPUB", "Web page"]);

export const unlocatedGroupLabel = "Not linked to a passage";

export interface AnnotationGroupHeading {
  /** The section, chapter or page shared by the cards below. */
  readonly label: string;
  /** Named only when the group belongs to a source other than the open one. */
  readonly source: { readonly title: string; readonly summary?: SourceSummary } | null;
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
 * usable locations gets no headings at all.
 */
export function annotationGroupHeadings(
  results: readonly Annotation[],
  currentSourceId: SourceId | undefined,
  sources: readonly SourceSummary[] = [],
): readonly (AnnotationGroupHeading | null)[] {
  let previous: string | null = null;
  let headed = false;
  return results.map((annotation) => {
    const group = annotationGroup(annotation, currentSourceId);
    const starts = group.key !== previous;
    previous = group.key;
    // Once any heading is shown, unlocated cards need their own so they do not join the last page.
    if (!starts || !(group.located || group.other || headed)) {
      return null;
    }
    headed = true;
    return { label: group.label, source: group.other ? groupSource(annotation, sources) : null };
  });
}

function annotationGroup(
  annotation: Annotation,
  currentSourceId: SourceId | undefined,
): { key: string; label: string; located: boolean; other: boolean } {
  const location = groupLocation(annotation);
  const linked = hasPassageAnchor(annotation.target);
  const other = annotationFromOtherSource(annotation, currentSourceId);
  const place = location ?? (linked ? "\u0001" : "");
  return {
    key: `${other ? annotation.sourceId : ""}\u0000${place}`,
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

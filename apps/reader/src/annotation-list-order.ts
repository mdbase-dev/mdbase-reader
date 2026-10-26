import { highlightColorKey, type Annotation, type HighlightColorKey } from "@mdbase-reader/core";

import { annotationBodyContent } from "./annotation-body-content.js";
export type AnnotationFilter = "all" | "comments" | "highlight" | "area" | "note" | "bookmark";
export function browseAnnotations(
  annotations: readonly Annotation[],
  query: string,
  filter: AnnotationFilter,
  order: "document" | "newest",
): Annotation[] {
  return searchAnnotationIndex(indexAnnotations(annotations, order), query, filter);
}

/** Sort and normalize once per snapshot/order, not on each search keystroke. */
interface AnnotationSearchEntry {
  readonly annotation: Annotation;
  readonly text: string;
}
export function indexAnnotations(
  annotations: readonly Annotation[],
  order: "document" | "newest",
): AnnotationSearchEntry[] {
  return [...annotations]
    .sort(
      order === "newest" ? (a, b) => b.createdAt.localeCompare(a.createdAt) : compareDocumentOrder,
    )
    .map((annotation) => ({
      annotation,
      text: [
        annotation.body,
        annotation.target?.quote?.exact,
        annotation.locator?.label,
        ...annotation.tags,
      ]
        .join(" ")
        .toLocaleLowerCase(),
    }));
}

export function searchAnnotationIndex(
  index: ReturnType<typeof indexAnnotations>,
  query: string,
  filter: AnnotationFilter,
): Annotation[] {
  const search = query.trim().toLocaleLowerCase();
  return index
    .filter(
      ({ annotation, text }) =>
        (filter === "all" ||
          (filter === "comments"
            ? Boolean(annotationBodyContent(annotation.body).note.trim())
            : annotation.annotationType === filter)) &&
        (!search || text.includes(search)),
    )
    .map(({ annotation }) => annotation);
}

/** A palette colour to list, or "" for any colour. */
export type AnnotationColorFilter = "" | HighlightColorKey;

/**
 * Whether an annotation shows in a colour: highlights and other passages do, missing or unknown
 * colours as yellow; a hex colour from another app matches no palette colour.
 */
export function annotationMatchesColor(
  annotation: Annotation,
  color: AnnotationColorFilter,
): boolean {
  if (!color) {
    return true;
  }
  return (
    (annotation.annotationType === "highlight" || Boolean(annotation.target?.quote)) &&
    highlightColorKey(annotation.color) === color
  );
}
function documentKey(annotation: Annotation): string {
  return `${annotation.document?.fileId ?? ""}@${annotation.document?.revision ?? ""}`;
}
interface Position {
  readonly kind: number;
  readonly section: string;
  readonly offset: number;
}
function position(annotation: Annotation): Position {
  const target = annotation.target;
  if (target?.pdf) {
    const pdf = target.pdf;
    const y = pdf.quadPoints[0]?.[1] ?? 0;
    return {
      kind: 0,
      section: `${String(pdf.pageIndex)}/${pdf.coordinateSpace.profile}/${pdf.coordinateSpace.origin}`,
      offset: pdf.coordinateSpace.origin === "top_left" ? y : -y,
    };
  }
  if (target?.position?.kind === "pdf") {
    // A page bookmark sorts before the page's passages.
    return { kind: 0, section: String(target.position.pageIndex), offset: 0 };
  }
  if (target?.epub) {
    return { kind: 1, section: target.epub.cfi.replace(/\[[^\]]*\]/gu, ""), offset: 0 };
  }
  if (target?.textPosition) {
    return {
      kind: 2,
      section: `${target.textPosition.basis.profile}/${target.textPosition.basis.hash}`,
      offset: target.textPosition.start,
    };
  }
  return { kind: 3, section: "", offset: 0 };
}
const sectionOrder = new Intl.Collator(undefined, { numeric: true });
function compareDocumentOrder(a: Annotation, b: Annotation): number {
  // Offsets are only comparable inside the same file, revision and coordinate basis.
  const ap = position(a),
    bp = position(b);
  return (
    documentKey(a).localeCompare(documentKey(b)) ||
    ap.kind - bp.kind ||
    sectionOrder.compare(ap.section, bp.section) ||
    ap.offset - bp.offset ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

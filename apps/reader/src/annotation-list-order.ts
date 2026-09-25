import { annotationBodyContent } from "./annotation-body-content.js";

import type { Annotation } from "@mdbase-reader/core";
export type AnnotationFilter = "all" | "comments" | "highlight" | "area" | "note" | "bookmark";
export function browseAnnotations(
  annotations: readonly Annotation[],
  query: string,
  filter: AnnotationFilter,
  order: "document" | "newest",
): Annotation[] {
  const search = query.trim().toLocaleLowerCase();
  return annotations
    .filter((annotation) => {
      const matches =
        filter === "all" ||
        (filter === "comments"
          ? Boolean(annotationBodyContent(annotation.body).note.trim())
          : annotation.annotationType === filter);
      return (
        matches &&
        (!search ||
          [
            annotation.body,
            annotation.target?.quote?.exact,
            annotation.locator?.label,
            ...annotation.tags,
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(search))
      );
    })
    .sort(
      order === "newest" ? (a, b) => b.createdAt.localeCompare(a.createdAt) : compareDocumentOrder,
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
function compareDocumentOrder(a: Annotation, b: Annotation): number {
  // Offsets are only comparable inside the same file, revision and coordinate basis.
  const ap = position(a),
    bp = position(b);
  return (
    documentKey(a).localeCompare(documentKey(b)) ||
    ap.kind - bp.kind ||
    ap.section.localeCompare(bp.section, undefined, { numeric: true }) ||
    ap.offset - bp.offset ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

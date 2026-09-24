import {
  PdfAnnotationBorderStyle,
  PdfAnnotationSubtype,
  type PdfHighlightAnnoObject,
  type PdfSquareAnnoObject,
  type Rect,
} from "@embedpdf/models";

import type { Annotation, PdfQuadPoints } from "@mdbase-reader/core";

const supportedCoordinateProfile = "embedpdf-selection-page-points-v1";
const supportedAreaCoordinateProfile = "embedpdf-capture-page-points-v1";

export function annotationToPdfDecoration(
  annotation: Annotation,
): PdfHighlightAnnoObject | PdfSquareAnnoObject | null {
  const pdf = annotation.target?.pdf;
  if (pdf?.coordinateSpace.origin !== "top_left") {
    return null;
  }
  const segmentRects = pdf.quadPoints.map(quadToRect);
  if (
    annotation.annotationType === "area" &&
    pdf.coordinateSpace.profile === supportedAreaCoordinateProfile
  ) {
    return areaDecoration(annotation, pdf.pageIndex, boundingRect(segmentRects));
  }
  if (
    (annotation.annotationType !== "highlight" &&
      !(annotation.annotationType === "note" && annotation.target?.quote)) ||
    pdf.coordinateSpace.profile !== supportedCoordinateProfile
  ) {
    return null;
  }
  return {
    id: `mdbase-reader:${annotation.id}`,
    type: PdfAnnotationSubtype.HIGHLIGHT,
    pageIndex: pdf.pageIndex,
    rect: boundingRect(segmentRects),
    segmentRects,
    contents: annotation.body,
    flags: ["locked", "lockedContents"],
    strokeColor: highlightColor(annotation.color),
    opacity: 0.38,
    ...(annotation.createdBy ? { author: annotation.createdBy } : {}),
    created: new Date(annotation.createdAt),
    modified: new Date(annotation.modifiedAt ?? annotation.createdAt),
    custom: { source: "mdbase-reader", annotationId: annotation.id },
  };
}

function areaDecoration(
  annotation: Annotation,
  pageIndex: number,
  rect: Rect,
): PdfSquareAnnoObject {
  return {
    id: `mdbase-reader:${annotation.id}`,
    type: PdfAnnotationSubtype.SQUARE,
    pageIndex,
    rect,
    contents: annotation.body,
    flags: ["locked", "lockedContents"],
    color: "transparent",
    strokeColor: "#5bb9f5",
    strokeWidth: 1.25,
    strokeStyle: PdfAnnotationBorderStyle.DASHED,
    strokeDashArray: [4, 3],
    opacity: 0.86,
    ...(annotation.createdBy ? { author: annotation.createdBy } : {}),
    created: new Date(annotation.createdAt),
    modified: new Date(annotation.modifiedAt ?? annotation.createdAt),
    custom: { source: "mdbase-reader", annotationId: annotation.id },
  };
}

function quadToRect(quad: PdfQuadPoints): Rect {
  const xs = [quad[0], quad[2], quad[4], quad[6]];
  const ys = [quad[1], quad[3], quad[5], quad[7]];
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    origin: { x: left, y: top },
    size: { width: Math.max(...xs) - left, height: Math.max(...ys) - top },
  };
}

function boundingRect(rects: readonly Rect[]): Rect {
  const left = Math.min(...rects.map((rect) => rect.origin.x));
  const top = Math.min(...rects.map((rect) => rect.origin.y));
  const right = Math.max(...rects.map((rect) => rect.origin.x + rect.size.width));
  const bottom = Math.max(...rects.map((rect) => rect.origin.y + rect.size.height));
  return { origin: { x: left, y: top }, size: { width: right - left, height: bottom - top } };
}

function highlightColor(color: string | undefined): string {
  if (color?.startsWith("#")) {
    return color;
  }
  return color === "blue" ? "#7bb7e8" : color === "green" ? "#8fcf9e" : "#f2ce63";
}

/**
 * A thin filled bar just left of a highlight's text, in page points, so highlights stay findable
 * in the margin. It carries the highlight's annotation id, so selecting it opens the same card.
 */
export function annotationToPdfMarginDecoration(
  annotation: Annotation,
): PdfSquareAnnoObject | null {
  const highlight = annotationToPdfDecoration(annotation);
  if (highlight?.type !== PdfAnnotationSubtype.HIGHLIGHT) {
    return null;
  }
  const noted = annotation.body
    .split("\n")
    .some((line) => line.trim() !== "" && !line.trimStart().startsWith(">"));
  const { origin, size } = highlight.rect;
  return {
    id: `${highlight.id}:margin`,
    type: PdfAnnotationSubtype.SQUARE,
    pageIndex: highlight.pageIndex,
    rect: {
      origin: { x: Math.max(2, origin.x - 9), y: origin.y },
      size: { width: 2.5, height: size.height },
    },
    contents: "",
    flags: ["locked", "lockedContents"],
    color: noted ? "#9d6700" : "#d39f00",
    strokeColor: "transparent",
    strokeWidth: 0,
    strokeStyle: PdfAnnotationBorderStyle.SOLID,
    opacity: noted ? 0.8 : 0.55,
    created: new Date(annotation.createdAt),
    modified: new Date(annotation.modifiedAt ?? annotation.createdAt),
    custom: { source: "mdbase-reader", annotationId: annotation.id, role: "margin" },
  };
}

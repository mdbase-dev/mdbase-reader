import { PdfAnnotationSubtype, type PdfHighlightAnnoObject, type Rect } from "@embedpdf/models";

import type { Annotation, PdfQuadPoints } from "@mdbase-reader/core";

const supportedCoordinateProfile = "embedpdf-selection-page-points-v1";

export function annotationToPdfDecoration(annotation: Annotation): PdfHighlightAnnoObject | null {
  const pdf = annotation.target?.pdf;
  if (
    annotation.annotationType !== "highlight" ||
    pdf?.coordinateSpace.profile !== supportedCoordinateProfile ||
    pdf.coordinateSpace.origin !== "top_left"
  ) {
    return null;
  }
  const segmentRects = pdf.quadPoints.map(quadToRect);
  return {
    id: `mdbase-reader:${annotation.id}`,
    type: PdfAnnotationSubtype.HIGHLIGHT,
    pageIndex: pdf.pageIndex,
    rect: boundingRect(segmentRects),
    segmentRects,
    contents: annotation.body,
    strokeColor: highlightColor(annotation.color),
    opacity: 0.38,
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

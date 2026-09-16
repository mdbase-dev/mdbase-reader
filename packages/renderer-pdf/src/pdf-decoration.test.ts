import { PdfAnnotationBorderStyle, PdfAnnotationSubtype } from "@embedpdf/models";
import { annotationId, collectionId, dateTime } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { annotationToPdfDecoration } from "./pdf-decoration.js";

const annotation = {
  collectionId: collectionId("reading"),
  id: annotationId("ann-1"),
  sourceId: "source-1" as never,
  source: "[[source-1]]",
  annotationType: "highlight",
  color: "yellow",
  target: {
    quote: { exact: "Selected text" },
    pdf: {
      pageIndex: 3,
      coordinateSpace: {
        profile: "embedpdf-selection-page-points-v1",
        box: "crop" as const,
        origin: "top_left" as const,
      },
      quadPoints: [[10, 20, 40, 20, 10, 28, 40, 28] as const],
    },
  },
  tags: [],
  body: "> Selected text",
  createdAt: dateTime("2026-08-09T00:00:00.000Z"),
};

describe("PDF annotation decorations", () => {
  it("maps exact EmbedPDF geometry into a non-canonical visual highlight", () => {
    expect(annotationToPdfDecoration(annotation)).toMatchObject({
      id: "mdbase-reader:ann-1",
      type: PdfAnnotationSubtype.HIGHLIGHT,
      pageIndex: 3,
      rect: { origin: { x: 10, y: 20 }, size: { width: 30, height: 8 } },
      segmentRects: [{ origin: { x: 10, y: 20 }, size: { width: 30, height: 8 } }],
      flags: ["locked", "lockedContents"],
    });
  });

  it("refuses geometry profiles that have no fixture-backed conversion", () => {
    expect(
      annotationToPdfDecoration({
        ...annotation,
        target: {
          ...annotation.target,
          pdf: {
            ...annotation.target.pdf,
            coordinateSpace: {
              ...annotation.target.pdf.coordinateSpace,
              profile: "pdf-default-user-space-v1",
              origin: "bottom_left",
            },
          },
        },
      }),
    ).toBeNull();
  });

  it("renders exact capture geometry as a locked area outline", () => {
    expect(
      annotationToPdfDecoration({
        ...annotation,
        annotationType: "area",
        target: {
          pdf: {
            pageIndex: 6,
            coordinateSpace: {
              profile: "embedpdf-capture-page-points-v1",
              box: "crop",
              origin: "top_left",
            },
            quadPoints: [[12, 24, 92, 24, 12, 69, 92, 69]],
          },
        },
      }),
    ).toMatchObject({
      id: "mdbase-reader:ann-1",
      type: PdfAnnotationSubtype.SQUARE,
      pageIndex: 6,
      rect: { origin: { x: 12, y: 24 }, size: { width: 80, height: 45 } },
      flags: ["locked", "lockedContents"],
      color: "transparent",
      strokeColor: "#5bb9f5",
      strokeWidth: 1.25,
      strokeStyle: PdfAnnotationBorderStyle.DASHED,
    });
  });
});

import { describe, expect, it } from "vitest";

import { textSelectionToDraft } from "./embedpdf-runtime.js";

describe("EmbedPDF selection mapping", () => {
  it("preserves selected text and labels top-left renderer geometry explicitly", () => {
    expect(
      textSelectionToDraft(
        ["exact  text"],
        [
          {
            pageIndex: 2,
            rect: { origin: { x: 10, y: 20 }, size: { width: 30, height: 8 } },
            segmentRects: [{ origin: { x: 10, y: 20 }, size: { width: 30, height: 8 } }],
          },
        ],
      ),
    ).toEqual({
      target: {
        quote: { exact: "exact  text" },
        pdf: {
          pageIndex: 2,
          coordinateSpace: {
            profile: "embedpdf-selection-page-points-v1",
            box: "crop",
            origin: "top_left",
          },
          quadPoints: [[10, 20, 40, 20, 10, 28, 40, 28]],
        },
      },
      locator: { kind: "pdf", pageIndex: 2 },
    });
  });

  it("keeps multi-page selections quote-addressable without false geometry", () => {
    const rect = { origin: { x: 1, y: 2 }, size: { width: 3, height: 4 } };
    expect(
      textSelectionToDraft(
        ["first", "second"],
        [
          { pageIndex: 2, rect, segmentRects: [rect] },
          { pageIndex: 3, rect, segmentRects: [rect] },
        ],
      ),
    ).toEqual({
      target: { quote: { exact: "first\nsecond" } },
      locator: { kind: "pdf", pageIndex: 2 },
    });
  });
});

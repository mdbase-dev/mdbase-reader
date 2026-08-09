import { describe, expect, it, vi } from "vitest";

import { extractPdfDocumentText, textSelectionToDraft } from "./embedpdf-runtime.js";

import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models";

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

describe("EmbedPDF text extraction", () => {
  it("extracts pages in responsive batches", async () => {
    const extractText = vi
      .fn()
      .mockReturnValueOnce({ toPromise: () => Promise.resolve("pages 1-2") })
      .mockReturnValueOnce({ toPromise: () => Promise.resolve("page 3") });
    const engine = { extractText } as unknown as PdfEngine;
    const document = { pageCount: 3 } as PdfDocumentObject;

    await expect(extractPdfDocumentText(engine, document, undefined, 2)).resolves.toBe(
      "pages 1-2\npage 3",
    );
    expect(extractText).toHaveBeenNthCalledWith(1, document, [0, 1]);
    expect(extractText).toHaveBeenNthCalledWith(2, document, [2]);
  });

  it("stops before starting another batch when cancelled", async () => {
    const controller = new AbortController();
    const extractText = vi.fn().mockReturnValue({
      toPromise: () => {
        controller.abort();
        return Promise.resolve("first");
      },
    });
    await expect(
      extractPdfDocumentText(
        { extractText } as unknown as PdfEngine,
        { pageCount: 3 } as PdfDocumentObject,
        controller.signal,
        1,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(extractText).toHaveBeenCalledOnce();
  });
});

import { PdfActionType, type PdfEngine } from "@embedpdf/models";
import { describe, expect, it, vi } from "vitest";

import { readPdfChapterOutline, readPdfDetails } from "./pdf-details.js";

function task<Value>(value: Value): { toPromise: () => Promise<Value> } {
  return { toPromise: () => Promise.resolve(value) };
}

describe("readPdfChapterOutline", () => {
  it("flattens nested local destinations, retains invalid outline entries for review, and never uses remote-page destinations", async () => {
    const closeDocument = vi.fn(() => task(true));
    const engine = {
      openDocumentBuffer: () => task({ id: "outline", pageCount: 12 }),
      getBookmarks: () =>
        task({
          bookmarks: [
            {
              title: "Chapter",
              target: { type: "destination", destination: { pageIndex: 2 } },
              children: [
                {
                  title: "Nested",
                  target: {
                    type: "action",
                    action: { type: PdfActionType.Goto, destination: { pageIndex: 3 } },
                  },
                },
                {
                  title: "Remote",
                  target: {
                    type: "action",
                    action: { type: PdfActionType.RemoteGoto, destination: { pageIndex: 8 } },
                  },
                },
              ],
            },
            { title: "Missing" },
          ],
        }),
      closeDocument,
    } as unknown as PdfEngine;
    const result = await readPdfChapterOutline(new Uint8Array(), {
      engine: () => Promise.resolve(engine),
    });
    expect(result).toEqual({
      pageCount: 12,
      entries: [
        { title: "Chapter", level: 0, pageIndex: 2 },
        { title: "Nested", level: 1, pageIndex: 3 },
        { title: "Remote", level: 1 },
        { title: "Missing", level: 0 },
      ],
    });
    expect(closeDocument).toHaveBeenCalledOnce();
  });
});

describe("readPdfDetails", () => {
  it("reads document information and the opening pages, then closes the document", async () => {
    const document = { id: "doc", pageCount: 12 };
    const extractText = vi.fn(() => task("doi:10.1038/171737a0"));
    const closeDocument = vi.fn(() => task(true));
    const engine = {
      openDocumentBuffer: vi.fn(() => task(document)),
      getMetadata: vi.fn(() =>
        task({
          title: "  Molecular structure\nof nucleic acids ",
          author: "",
          subject: null,
          keywords: "DNA",
        }),
      ),
      extractText,
      closeDocument,
    } as unknown as PdfEngine;

    const details = await readPdfDetails(new Uint8Array([37, 80, 68, 70]), {
      engine: () => Promise.resolve(engine),
    });

    expect(details).toEqual({
      title: "Molecular structure of nucleic acids",
      keywords: "DNA",
      openingText: "doi:10.1038/171737a0",
    });
    expect(extractText).toHaveBeenCalledWith(document, [0, 1]);
    expect(closeDocument).toHaveBeenCalledWith(document);
  });
});

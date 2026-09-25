import { describe, expect, it, vi } from "vitest";

import { readPdfDetails } from "./pdf-details.js";

import type { PdfEngine } from "@embedpdf/models";

function task<Value>(value: Value): { toPromise: () => Promise<Value> } {
  return { toPromise: () => Promise.resolve(value) };
}

describe("readPdfDetails", () => {
  it("reads document information and the opening pages, then closes the document", async () => {
    const document = { id: "doc", pageCount: 12 };
    const extractText = vi.fn(() => task("doi:10.1038/nature14539"));
    const closeDocument = vi.fn(() => task(true));
    const engine = {
      openDocumentBuffer: vi.fn(() => task(document)),
      getMetadata: vi.fn(() =>
        task({ title: "  Deep\nlearning ", author: "", subject: null, keywords: "AI" }),
      ),
      extractText,
      closeDocument,
    } as unknown as PdfEngine;

    const details = await readPdfDetails(new Uint8Array([37, 80, 68, 70]), {
      engine: () => Promise.resolve(engine),
    });

    expect(details).toEqual({
      title: "Deep learning",
      keywords: "AI",
      openingText: "doi:10.1038/nature14539",
    });
    expect(extractText).toHaveBeenCalledWith(document, [0, 1]);
    expect(closeDocument).toHaveBeenCalledWith(document);
  });
});

import { describe, expect, it, vi } from "vitest";

import { capturePage } from "./capture-page.js";
import { MAX_PDF_CAPTURE_BYTES } from "./capture-pdf.js";

const dependencies = (response: Response): Parameters<typeof capturePage>[1] => ({
  fetch: vi.fn(() => Promise.resolve(response)),
  resolveAddresses: vi.fn(() => Promise.resolve(["93.184.216.34"])),
  now: () => new Date("2026-09-25T00:00:00.000Z"),
});

const pdfBytes = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n");

describe("PDF capture", () => {
  it("streams a PDF with provenance only when the request allows PDFs", async () => {
    const response = (): Response =>
      new Response(pdfBytes, { headers: { "content-type": "application/pdf" } });
    await expect(
      capturePage("https://example.com/paper.pdf", dependencies(response())),
    ).rejects.toThrow("did not return an HTML page");

    const captured = await capturePage("https://example.com/paper.pdf", dependencies(response()), {
      allowPdf: true,
    });
    expect(captured).toMatchObject({
      submittedUrl: "https://example.com/paper.pdf",
      canonicalUrl: "https://example.com/paper.pdf",
      retrievedAt: "2026-09-25T00:00:00.000Z",
    });
    if (!("pdf" in captured)) {
      throw new Error("Expected a PDF capture.");
    }
    expect(new Uint8Array(await new Response(captured.pdf).arrayBuffer())).toEqual(pdfBytes);
  });

  it("recognises PDFs served as generic binary and refuses binary that is not a PDF", async () => {
    const octet = await capturePage(
      "https://example.com/download?id=1",
      dependencies(
        new Response(pdfBytes, { headers: { "content-type": "application/octet-stream" } }),
      ),
      { allowPdf: true },
    );
    expect("pdf" in octet).toBe(true);

    await expect(
      capturePage(
        "https://example.com/archive.zip",
        dependencies(
          new Response(new Uint8Array([0x50, 0x4b, 3, 4, 0]), {
            headers: { "content-type": "application/octet-stream" },
          }),
        ),
        { allowPdf: true },
      ),
    ).rejects.toThrow("did not return an HTML page or a PDF");
  });

  it("still captures HTML when PDFs are allowed, and refuses declared oversized PDFs", async () => {
    const html = await capturePage(
      "https://example.com/page",
      dependencies(
        new Response("<!doctype html><p>Hi</p>", { headers: { "content-type": "text/html" } }),
      ),
      { allowPdf: true },
    );
    expect(html).toMatchObject({ html: "<!doctype html><p>Hi</p>" });

    await expect(
      capturePage(
        "https://example.com/huge.pdf",
        dependencies(
          new Response(pdfBytes, {
            headers: {
              "content-type": "application/pdf",
              "content-length": String(MAX_PDF_CAPTURE_BYTES + 1),
            },
          }),
        ),
        { allowPdf: true },
      ),
    ).rejects.toThrow("50 MB");
  });
});

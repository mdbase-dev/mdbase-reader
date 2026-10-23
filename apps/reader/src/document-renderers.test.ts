import { expect, it, vi } from "vitest";

import { preloadDocumentRenderer } from "./document-renderers.js";

const loaded = vi.hoisted(() => ({ pdf: 0, epub: 0, html: 0 }));
vi.mock("@mdbase-reader/renderer-pdf", () => {
  loaded.pdf += 1;
  return { PdfViewerSurface: () => null };
});
vi.mock("@mdbase-reader/renderer-epub", () => {
  loaded.epub += 1;
  return { EpubViewerSurface: () => null };
});
vi.mock("@mdbase-reader/renderer-html", () => {
  loaded.html += 1;
  return { HtmlViewerSurface: () => null };
});

it("loads only the selected type, including extension fallback, never every renderer", async () => {
  expect(loaded).toEqual({ pdf: 0, epub: 0, html: 0 });
  preloadDocumentRenderer("application/octet-stream", "unknown.bin");
  expect(loaded).toEqual({ pdf: 0, epub: 0, html: 0 });
  preloadDocumentRenderer("text/html", "page.html");
  await vi.waitFor(() => expect(loaded).toEqual({ pdf: 0, epub: 0, html: 1 }));
  preloadDocumentRenderer("application/pdf", "document.pdf");
  await vi.waitFor(() => expect(loaded).toEqual({ pdf: 1, epub: 0, html: 1 }));
  preloadDocumentRenderer("application/octet-stream", "book.epub");
  await vi.waitFor(() => expect(loaded).toEqual({ pdf: 1, epub: 1, html: 1 }));
});

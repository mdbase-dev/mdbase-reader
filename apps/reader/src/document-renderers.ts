import { isEpub, isHtml, isPdf } from "./document-media.js";
import { lazyFeature } from "./lazy-feature.js";

export const PdfViewerSurface = lazyFeature(
  async () => ({ default: (await import("@mdbase-reader/renderer-pdf")).PdfViewerSurface }),
  "the PDF renderer",
);
export const EpubViewerSurface = lazyFeature(
  async () => ({ default: (await import("@mdbase-reader/renderer-epub")).EpubViewerSurface }),
  "the EPUB renderer",
);
export const HtmlViewerSurface = lazyFeature(
  async () => ({ default: (await import("@mdbase-reader/renderer-html")).HtmlViewerSurface }),
  "the HTML renderer",
);

/** The selected/restored document's renderer starts downloading alongside its bytes. */
export function preloadDocumentRenderer(mediaType: string, file: string): void {
  if (isPdf(mediaType, file)) {
    PdfViewerSurface.preload();
  } else if (isEpub(mediaType, file)) {
    EpubViewerSurface.preload();
  } else if (isHtml(mediaType, file)) {
    HtmlViewerSurface.preload();
  }
}

import { LockModeType, type PDFViewerConfig } from "@embedpdf/react-pdf-viewer";

import { readerPdfTheme } from "./pdf-viewer-theme.js";
import { readerPdfDisabledCategories, readerPdfUiSchema } from "./pdf-viewer-ui-schema.js";

export { readerPdfTheme } from "./pdf-viewer-theme.js";
export { readerPdfDisabledCategories, readerPdfUiSchema } from "./pdf-viewer-ui-schema.js";

/**
 * Whether a finger is the reader's main pointer (phones and tablets, not touchscreen laptops).
 * Such devices open PDFs panning, so a drag scrolls, and select text with an explicit tool.
 */
export function pdfPansByDefault(): boolean {
  return "matchMedia" in globalThis && globalThis.matchMedia("(pointer: coarse)").matches;
}

/**
 * Makes the third-party viewer a read-only engine beneath Reader's durable
 * annotation model. UI schema and command categories intentionally reinforce
 * the same boundary.
 */
export function createReaderPdfViewerConfig(
  src: string,
  pansByDefault: boolean = pdfPansByDefault(),
): PDFViewerConfig {
  return {
    src,
    tabBar: "never",
    disabledCategories: [...readerPdfDisabledCategories],
    permissions: {
      overrides: {
        assembleDocument: false,
        fillForms: false,
        modifyContents: false,
      },
    },
    ui: {
      schema: readerPdfUiSchema,
    },
    annotations: {
      autoCommit: false,
      // Reader annotations carry the PDF `locked` flags themselves. Keeping the document-level
      // lock off lets EmbedPDF select them and publish an activation while permissions still
      // prevent structural or content changes.
      locked: { type: LockModeType.None },
    },
    // EmbedPDF's own "mobile" default pans on any browser reporting touch support, including
    // touchscreen laptops, where the mouse should select. Text selection takes every drag on a
    // phone, so nothing scrolls. The primary pointer decides; phones select through Reader's tool.
    pan: { defaultMode: pansByDefault ? "always" : "never" },
    render: {
      withAnnotations: false,
      withForms: false,
    },
    fonts: {
      ui: {
        family: '"Atkinson Hyperlegible", "Segoe UI", sans-serif',
        stylesheetUrl: null,
      },
      signature: null,
    },
    theme: readerPdfTheme,
  };
}

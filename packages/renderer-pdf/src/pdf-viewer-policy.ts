import { LockModeType, type PDFViewerConfig } from "@embedpdf/react-pdf-viewer";

import { readerPdfTheme } from "./pdf-viewer-theme.js";
import { readerPdfDisabledCategories, readerPdfUiSchema } from "./pdf-viewer-ui-schema.js";

export { readerPdfTheme } from "./pdf-viewer-theme.js";
export { readerPdfDisabledCategories, readerPdfUiSchema } from "./pdf-viewer-ui-schema.js";

/**
 * Makes the third-party viewer a read-only engine beneath Reader's durable
 * annotation model. UI schema and command categories intentionally reinforce
 * the same boundary.
 */
export function createReaderPdfViewerConfig(src: string): PDFViewerConfig {
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
      locked: { type: LockModeType.All },
    },
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

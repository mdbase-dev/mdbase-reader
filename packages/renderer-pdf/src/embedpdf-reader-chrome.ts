import type { EmbedPdfContainer } from "@embedpdf/react-pdf-viewer";
import type { Unsubscribe } from "@mdbase-reader/reading-surface";

const readerChromeStyleAttribute = "data-mdbase-reader-pdf-chrome";

/**
 * Keeps EmbedPDF's native controls aligned with Reader's visual language.
 * The selectors deliberately match the snippet's own inline presentation so
 * unrelated PDF content and annotation layers are left untouched.
 */
export function installReaderPdfChrome(container: EmbedPdfContainer): Unsubscribe {
  const root = container.shadowRoot;
  if (!root) {
    return () => undefined;
  }
  const existing = root.querySelector<HTMLStyleElement>(`style[${readerChromeStyleAttribute}]`);
  if (existing) {
    return () => undefined;
  }
  const style = root.ownerDocument.createElement("style");
  style.setAttribute(readerChromeStyleAttribute, "");
  style.textContent = readerPdfChromeCss;
  root.append(style);
  return () => style.remove();
}

export const readerPdfChromeCss = `
[data-epdf-i="reader-page-controls"] {
  display: flex;
  height: 100%;
  align-items: center;
}

[data-epdf-i="reader-page-controls"] > .pointer-events-auto {
  display: flex;
  align-items: center;
}

[data-epdf-i="reader-page-controls"] > .pointer-events-auto > div {
  gap: 0.125rem;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  opacity: 1 !important;
  transition: none;
}

[data-epdf-i="reader-page-controls"] input {
  height: 1.5rem;
  width: 2.25rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
}

/* Keep the selected content readable while drawing a precise capture frame. */
div[style*="border: 1px solid rgba(33, 150, 243, 0.8)"][style*="background: rgba(33, 150, 243, 0.15)"] {
  border-color: #2563eb !important;
  background: transparent !important;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.9),
    0 0 0 3px rgba(37, 99, 235, 0.2);
}
`;

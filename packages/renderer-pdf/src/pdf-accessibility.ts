import { t } from "@lingui/core/macro";

import { findPdfScroller, findPdfViewport } from "./pdf-touch-selection-view.js";

import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models";
import type { EmbedPdfContainer } from "@embedpdf/react-pdf-viewer";
import type { Unsubscribe } from "@mdbase-reader/reading-surface";

export function installPdfAccessibility(
  container: EmbedPdfContainer,
  engine: PdfEngine,
  document: PdfDocumentObject,
): Unsubscribe {
  const root = container.shadowRoot;
  if (!root) {
    throw new Error(t`The PDF reading surface is unavailable.`);
  }
  const text = root.ownerDocument.createElement("article");
  text.className = "reader-pdf-text";
  text.setAttribute("aria-label", t`PDF page text`);
  const lifetime = new AbortController();
  const isActive = (): boolean => !lifetime.signal.aborted;
  let allPagesHaveText = true;
  let complete = false;
  const update = (): void => {
    const scroller = findPdfScroller(root);
    const viewport = findPdfViewport(scroller);
    if (scroller && !scroller.contains(text)) {
      scroller.prepend(text);
    }
    if (viewport) {
      viewport.tabIndex = 0;
      viewport.setAttribute("role", "region");
      viewport.setAttribute("aria-label", t`PDF pages`);
    }
    root
      .querySelector('[data-epdf-i="reader-page-controls"] input')
      ?.setAttribute("aria-label", t`Page`);
    for (const image of root.querySelectorAll("img")) {
      image.alt = complete && allPagesHaveText ? "" : t`PDF page image`;
    }
    for (const icon of root.querySelectorAll("button svg, [role=button] svg")) {
      icon.setAttribute("aria-hidden", "true");
      icon.removeAttribute("role");
    }
  };
  const observer = new MutationObserver(update);
  observer.observe(root, { childList: true, subtree: true });
  update();
  void (async () => {
    for (let index = 0; index < document.pageCount && isActive(); index += 1) {
      const page = root.ownerDocument.createElement("section");
      const heading = root.ownerDocument.createElement("h2");
      const number = index + 1;
      heading.textContent = t`Page ${number}`;
      page.append(heading);
      try {
        const content = await engine.extractText(document, [index]).toPromise();
        if (!isActive()) {
          return;
        }
        allPagesHaveText &&= Boolean(content.trim());
        const paragraph = root.ownerDocument.createElement("p");
        paragraph.textContent = content.trim() || t`No extractable text on this page.`;
        page.append(paragraph);
      } catch {
        if (!isActive()) {
          return;
        }
        allPagesHaveText = false;
        const problem = root.ownerDocument.createElement("p");
        problem.textContent = t`Page text could not be loaded.`;
        page.append(problem);
      }
      text.append(page);
    }
    if (isActive()) {
      complete = true;
      update();
    }
  })();
  return () => {
    lifetime.abort();
    observer.disconnect();
    text.remove();
  };
}

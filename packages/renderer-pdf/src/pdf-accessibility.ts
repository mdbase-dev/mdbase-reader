import { t } from "@lingui/core/macro";

import { findPdfScroller, findPdfViewport } from "./pdf-touch-selection-view.js";

import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models";
import type { EmbedPdfContainer } from "@embedpdf/react-pdf-viewer";
import type { Unsubscribe } from "@mdbase-reader/reading-surface";

export function installPdfAccessibility(
  container: EmbedPdfContainer,
  engine: PdfEngine,
  document: PdfDocumentObject,
  onViewportReady: () => void,
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
  let viewportReady = false;
  const updateSheet = pdfSheetAccessibility(root);
  const keydown = (event: Event): void => pdfNavigationKey(root, event as KeyboardEvent);
  root.addEventListener("keydown", keydown, true);
  const update = (): void => {
    updateSheet();
    const scroller = findPdfScroller(root);
    const viewport = findPdfViewport(scroller);
    if (scroller && !scroller.contains(text)) {
      scroller.prepend(text);
    }
    if (viewport) {
      viewport.tabIndex = 0;
      viewport.setAttribute("role", "region");
      viewport.setAttribute("aria-label", t`PDF pages`);
      viewport.setAttribute("data-reader-pdf-viewport", "");
      if (!viewportReady) {
        viewportReady = true;
        onViewportReady();
      }
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
    root.removeEventListener("keydown", keydown, true);
    text.remove();
  };
}

function namePdfNavigation(root: ShadowRoot): void {
  const sidebar = root.querySelector<HTMLElement>('[data-sidebar-id="sidebar-panel"]');
  if (sidebar) {
    const tabs = Array.from(sidebar.querySelectorAll<HTMLElement>('[role="tab"]'));
    tabs[0]?.setAttribute("aria-label", t`Thumbnails`);
    tabs[1]?.setAttribute("aria-label", t`Outline`);
    tabs[0]?.parentElement?.setAttribute("role", "tablist");
    tabs[0]?.parentElement?.setAttribute("aria-label", t`PDF navigation`);
    const active = tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ?? tabs[0];
    const panel = sidebar.querySelector<HTMLElement>(
      '[style*="overflow-y: auto"], .overflow-y-auto',
    );
    tabs.forEach((tab, index) => {
      tab.id = `reader-pdf-nav-${String(index)}`;
      tab.tabIndex = tab === active ? 0 : -1;
      tab.setAttribute("aria-controls", "reader-pdf-navigation-panel");
    });
    if (panel && active) {
      panel.id = "reader-pdf-navigation-panel";
      panel.tabIndex = 0;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", active.id);
      namePdfThumbnails(panel);
    }
  }
}

function namePdfThumbnails(panel: HTMLElement): void {
  for (const thumbnail of panel.querySelectorAll<HTMLElement>('div[style*="cursor: pointer"]')) {
    const number = thumbnail.querySelector("span")?.textContent.trim();
    if (thumbnail.querySelector("img") && number && /^\d+$/u.test(number)) {
      thumbnail.tabIndex = 0;
      thumbnail.classList.add("reader-pdf-thumbnail");
      thumbnail.setAttribute("role", "button");
      thumbnail.setAttribute("aria-label", t`Page ${number}`);
    }
  }
}

function pdfSheetAccessibility(root: ShadowRoot): () => void {
  let current: Element | null = null;
  let returnTo: HTMLElement | null = null;
  return () => {
    namePdfNavigation(root);
    const sheet = root.querySelector<HTMLElement>(
      '.bg-bg-overlay + [data-sidebar-id="sidebar-panel"]',
    );
    const backdrop = sheet?.previousElementSibling;
    if (sheet) {
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-modal", "true");
      sheet.setAttribute("aria-label", t`PDF navigation`);
    }
    if (sheet === current) {
      return;
    }
    current = sheet;
    if (!sheet) {
      returnTo?.focus();
      return;
    }
    returnTo = root.activeElement instanceof HTMLElement ? root.activeElement : null;
    const controls = (): HTMLElement[] =>
      Array.from(
        sheet.querySelectorAll<HTMLElement>(
          'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), [tabindex="0"]',
        ),
      ).filter((element) => element.getClientRects().length > 0);
    controls()[0]?.focus();
    sheet.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (backdrop instanceof HTMLElement) {
          backdrop.click();
        }
      } else if (event.key === "Tab") {
        const items = controls();
        const index = items.indexOf(root.activeElement as HTMLElement);
        if ((event.shiftKey && index <= 0) || (!event.shiftKey && index === items.length - 1)) {
          event.preventDefault();
          items[event.shiftKey ? items.length - 1 : 0]?.focus();
        }
      }
    });
  };
}

function pdfNavigationKey(root: ShadowRoot, event: KeyboardEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  if (target.matches('[role="tab"]')) {
    const tabs = Array.from(
      target.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [],
    );
    const index = tabs.indexOf(target);
    const destination = pdfTabDestination(event.key, index, tabs.length);
    if (destination !== null) {
      event.preventDefault();
      event.stopPropagation();
      tabs[destination]?.click();
      tabs[destination]?.focus();
    }
  } else if (target.matches(".reader-pdf-thumbnail") && root.contains(target)) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      target.click();
    }
  }
}

function pdfTabDestination(key: string, index: number, count: number): number | null {
  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

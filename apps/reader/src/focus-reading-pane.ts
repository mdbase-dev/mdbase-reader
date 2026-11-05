export function focusReadingPane(pane: HTMLElement): void {
  const frame = pane.querySelector<HTMLIFrameElement>("iframe");
  if (frame?.contentDocument?.body) {
    frame.contentWindow?.focus();
    frame.contentDocument.body.tabIndex = -1;
    frame.contentDocument.body.focus({ preventScroll: true });
    return;
  }
  const pdf = pane.querySelector("embedpdf-container")?.shadowRoot;
  const viewport = pdf?.querySelector<HTMLElement>("[data-reader-pdf-viewport]");
  (viewport ?? pane).focus({ preventScroll: true });
}

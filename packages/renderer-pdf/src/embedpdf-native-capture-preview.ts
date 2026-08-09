import type { EmbedPdfContainer } from "@embedpdf/react-pdf-viewer";
import type { Unsubscribe } from "@mdbase-reader/reading-surface";

const nativeCaptureImageSelector = 'img[alt="Captured PDF area"]';
const nativeDialogSelector = ".fixed.inset-0";

/**
 * The EmbedPDF snippet mounts a download-oriented capture dialog whenever the
 * capture plugin emits. Reader consumes that same event in its own annotation
 * composer, so close the duplicate snippet dialog as soon as it appears.
 *
 * Keep this compatibility boundary isolated: it can be removed when the
 * snippet exposes a supported way to omit its native capture preview.
 */
export function suppressNativeCapturePreview(container: EmbedPdfContainer): Unsubscribe {
  const root = container.shadowRoot;
  if (!root) {
    return () => undefined;
  }
  const dismiss = (): void => capturePreviewCloseButton(root)?.click();
  const observer = new MutationObserver(dismiss);
  observer.observe(root, { childList: true, subtree: true });
  dismiss();
  return () => observer.disconnect();
}

export function capturePreviewCloseButton(root: ParentNode): HTMLButtonElement | null {
  const preview = root.querySelector<HTMLImageElement>(nativeCaptureImageSelector);
  const dialog = preview?.closest<HTMLElement>(nativeDialogSelector);
  return dialog?.querySelector<HTMLButtonElement>("button") ?? null;
}

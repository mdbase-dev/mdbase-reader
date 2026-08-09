import { AnnotationPlugin } from "@embedpdf/plugin-annotation";
import { SelectionPlugin, type FormattedSelection } from "@embedpdf/plugin-selection";
import {
  CapturePlugin,
  DocumentManagerPlugin,
  ScrollPlugin,
  type PluginRegistry,
} from "@embedpdf/react-pdf-viewer";

import { annotationToPdfDecoration } from "./pdf-decoration.js";

import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models";
import type { CaptureAreaEvent } from "@embedpdf/plugin-capture";
import type { Annotation } from "@mdbase-reader/core";
import type {
  AreaSelectionDraft,
  TextSelectionDraft,
  Unsubscribe,
} from "@mdbase-reader/reading-surface";

export interface EmbedPdfRuntime {
  currentPageIndex(): number;
  goToPage(pageIndex: number): void;
  beginAreaSelection(): void;
  cancelAreaSelection(): void;
  onPageChanged(listener: (pageIndex: number) => void): Unsubscribe;
  onAreaSelected(listener: (selection: AreaSelectionDraft) => void): Unsubscribe;
  onTextSelected(listener: (selection: TextSelectionDraft) => void): Unsubscribe;
  clearTextSelection(): void;
  extractText(options?: { readonly signal?: AbortSignal }): Promise<string>;
  setAnnotations(annotations: readonly Annotation[]): void;
  destroy(): void;
}

export function textSelectionToDraft(
  textParts: readonly string[],
  formatted: readonly FormattedSelection[],
): TextSelectionDraft | null {
  const exact = textParts.join("\n");
  if (!exact.trim() || formatted.length === 0) {
    return null;
  }
  const first = formatted[0];
  const firstPage = first?.pageIndex ?? 0;
  const pdf =
    formatted.length === 1 && first
      ? {
          pdf: {
            pageIndex: firstPage,
            coordinateSpace: {
              profile: "embedpdf-selection-page-points-v1",
              box: "crop" as const,
              origin: "top_left" as const,
            },
            quadPoints: first.segmentRects.map(rectToQuadPoints),
          },
        }
      : {};
  return {
    target: { quote: { exact }, ...pdf },
    locator: { kind: "pdf", pageIndex: firstPage },
  };
}

function rectToQuadPoints(
  rect: FormattedSelection["rect"],
): readonly [number, number, number, number, number, number, number, number] {
  const left = rect.origin.x;
  const top = rect.origin.y;
  const right = left + rect.size.width;
  const bottom = top + rect.size.height;
  return [left, top, right, top, left, bottom, right, bottom];
}

export function captureEventToAreaSelection(event: CaptureAreaEvent): AreaSelectionDraft {
  return {
    pageIndex: event.pageIndex,
    rect: {
      x: event.rect.origin.x,
      y: event.rect.origin.y,
      width: event.rect.size.width,
      height: event.rect.size.height,
    },
    coordinateProfile: "embedpdf-capture-page-points-v1",
    image: event.blob,
    imageType: event.imageType,
    scale: event.scale,
    withAnnotations: event.withAnnotations,
  };
}

export function createEmbedPdfRuntime(registry: PluginRegistry): EmbedPdfRuntime {
  const capturePlugin = registry.getPlugin<CapturePlugin>(CapturePlugin.id);
  const scrollPlugin = registry.getPlugin<ScrollPlugin>(ScrollPlugin.id);
  const selectionPlugin = registry.getPlugin<SelectionPlugin>(SelectionPlugin.id);
  const annotationPlugin = registry.getPlugin<AnnotationPlugin>(AnnotationPlugin.id);
  if (!capturePlugin || !scrollPlugin || !selectionPlugin || !annotationPlugin) {
    throw new Error("EmbedPDF did not initialize the required Reader plugins.");
  }

  const capture = capturePlugin.provides();
  const scroll = scrollPlugin.provides();
  const selection = selectionPlugin.provides();
  const annotationCapability = annotationPlugin.provides();
  const subscriptions = new Set<Unsubscribe>();
  const decorationIds = new Set<string>();

  return {
    currentPageIndex: () => Math.max(0, scroll.getCurrentPage() - 1),
    goToPage: (pageIndex) => scroll.scrollToPage({ pageNumber: pageIndex + 1 }),
    beginAreaSelection: () => capture.enableMarqueeCapture(),
    cancelAreaSelection: () => capture.disableMarqueeCapture(),
    onPageChanged(listener) {
      const unsubscribe = scroll.onPageChange((event) =>
        listener(Math.max(0, event.pageNumber - 1)),
      );
      subscriptions.add(unsubscribe);
      return () => {
        subscriptions.delete(unsubscribe);
        unsubscribe();
      };
    },
    onAreaSelected(listener) {
      const unsubscribe = capture.onCaptureArea((event) =>
        listener(captureEventToAreaSelection(event)),
      );
      subscriptions.add(unsubscribe);
      return () => {
        subscriptions.delete(unsubscribe);
        unsubscribe();
      };
    },
    onTextSelected(listener) {
      const unsubscribe = selection.onEndSelection(() => {
        const formatted = selection.getFormattedSelection();
        void selection
          .getSelectedText()
          .toPromise()
          .then((parts) => {
            const draft = textSelectionToDraft(parts, formatted);
            if (draft) {
              listener(draft);
            }
          });
      });
      subscriptions.add(unsubscribe);
      return () => {
        subscriptions.delete(unsubscribe);
        unsubscribe();
      };
    },
    clearTextSelection: () => selection.clear(),
    async extractText(options) {
      const manager = registry.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id);
      if (!manager) {
        throw new Error("EmbedPDF did not initialize its document manager.");
      }
      const document = await activePdfDocument(manager.provides(), options?.signal);
      return extractPdfDocumentText(registry.getEngine(), document, options?.signal);
    },
    setAnnotations(annotations) {
      for (const annotation of annotations) {
        const decoration = annotationToPdfDecoration(annotation);
        if (decoration && !decorationIds.has(decoration.id)) {
          annotationCapability.createAnnotation(decoration.pageIndex, decoration);
          decorationIds.add(decoration.id);
        }
      }
    },
    destroy() {
      for (const unsubscribe of subscriptions) {
        unsubscribe();
      }
      subscriptions.clear();
    },
  };
}

type DocumentManagerCapability = ReturnType<DocumentManagerPlugin["provides"]>;

async function activePdfDocument(
  documents: DocumentManagerCapability,
  signal?: AbortSignal,
): Promise<PdfDocumentObject> {
  signal?.throwIfAborted();
  const active = documents.getActiveDocument();
  if (active) {
    return active;
  }
  return new Promise((resolve, reject) => {
    let unsubscribeOpened = (): void => undefined;
    let unsubscribeError = (): void => undefined;
    const aborted = (): void => finish(() => reject(abortReason(signal)));
    const finish = (settle: () => void): void => {
      unsubscribeOpened();
      unsubscribeError();
      signal?.removeEventListener("abort", aborted);
      settle();
    };
    unsubscribeOpened = documents.onDocumentOpened(({ document }) => {
      if (document) {
        finish(() => resolve(document));
      }
    });
    unsubscribeError = documents.onDocumentError(({ message }) => {
      finish(() => reject(new Error(message)));
    });
    signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) {
      aborted();
      return;
    }
    const openedWhileSubscribing = documents.getActiveDocument();
    if (openedWhileSubscribing) {
      finish(() => resolve(openedWhileSubscribing));
    }
  });
}

export async function extractPdfDocumentText(
  engine: PdfEngine,
  document: PdfDocumentObject,
  signal?: AbortSignal,
  batchSize = 16,
): Promise<string> {
  const parts: string[] = [];
  for (let start = 0; start < document.pageCount; start += batchSize) {
    signal?.throwIfAborted();
    const count = Math.min(batchSize, document.pageCount - start);
    const pages = Array.from({ length: count }, (_value, index) => start + index);
    parts.push(await engine.extractText(document, pages).toPromise());
    await yieldToBrowser(signal);
  }
  return parts.join("\n");
}

function yieldToBrowser(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const complete = (): void => {
      signal?.removeEventListener("abort", aborted);
      resolve();
    };
    const aborted = (): void => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    const timer = setTimeout(complete, 0);
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

function abortError(): DOMException {
  return new DOMException("PDF text extraction was cancelled.", "AbortError");
}

function abortReason(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error ? signal.reason : abortError();
}

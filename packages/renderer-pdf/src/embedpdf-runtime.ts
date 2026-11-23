import { AnnotationPlugin } from "@embedpdf/plugin-annotation";
import { SelectionPlugin } from "@embedpdf/plugin-selection";
import {
  CapturePlugin,
  DocumentManagerPlugin,
  ScrollPlugin,
  ViewportPlugin,
  type EmbedPdfContainer,
  type PluginRegistry,
} from "@embedpdf/react-pdf-viewer";
import { t } from "@lingui/core/macro";

import {
  createEmbedPdfAnnotationActivations,
  observePagePresses,
  type EmbedPdfAnnotationActivations,
} from "./embedpdf-annotation-activation.js";
import { createPdfDecorationController } from "./pdf-decoration-controller.js";
import { createPdfPageNavigation } from "./pdf-page-navigation.js";
import { observePdfSelection, type PdfSelectionAdjustment } from "./pdf-selection-publication.js";
import { createPdfViewportLocator, type PdfPageRect } from "./pdf-viewport-rect.js";

import type { PdfDocumentObject } from "@embedpdf/models";
import type { CaptureAreaEvent } from "@embedpdf/plugin-capture";
import type { Annotation, AnnotationId } from "@mdbase-reader/core";
import type {
  AreaSelectionDraft,
  EventSource,
  TextSelectionDraft,
  Unsubscribe,
  ViewportRect,
} from "@mdbase-reader/reading-surface";

export { textSelectionToDraft } from "./pdf-selection-publication.js";

export interface EmbedPdfRuntime {
  currentPageIndex(): number;
  pageCount?(): Promise<number>;
  goToPage(pageIndex: number): void | Promise<void>;
  beginAreaSelection(): void;
  cancelAreaSelection(): void;
  onPageChanged(listener: (pageIndex: number) => void): Unsubscribe;
  /** The viewport's scroll offset as the reader scrolls, when EmbedPDF reports it. */
  onScrolled?(listener: (scrollTop: number) => void): Unsubscribe;
  onViewportResized?(listener: () => void): Unsubscribe;
  onAreaSelected(listener: (selection: AreaSelectionDraft) => void): Unsubscribe;
  onTextSelected(listener: (selection: TextSelectionDraft) => void): Unsubscribe;
  onSelectionCleared?(listener: () => void): Unsubscribe;
  onAnnotationActivated(listener: (annotationId: AnnotationId) => void): Unsubscribe;
  /** The reader let go of the selected highlight in the page, as by clicking empty page. */
  onAnnotationDismissed?(listener: () => void): Unsubscribe;
  /** Where the highlight activated last sits on screen, when the viewer can say. */
  activationRect?(): ViewportRect | null;
  clearTextSelection(): void;
  setAnnotations(annotations: readonly Annotation[]): void;
  setActiveAnnotation(annotation: Annotation | null): void;
  destroy(): void;
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

export function createEmbedPdfRuntime(
  registry: PluginRegistry,
  adjustments?: EventSource<PdfSelectionAdjustment>,
  /** The viewer element, for measuring selections and highlights on screen. */
  host?: () => EmbedPdfContainer | null,
): EmbedPdfRuntime {
  const capturePlugin = registry.getPlugin<CapturePlugin>(CapturePlugin.id);
  const scrollPlugin = registry.getPlugin<ScrollPlugin>(ScrollPlugin.id);
  const selectionPlugin = registry.getPlugin<SelectionPlugin>(SelectionPlugin.id);
  const annotationPlugin = registry.getPlugin<AnnotationPlugin>(AnnotationPlugin.id);
  if (!capturePlugin || !scrollPlugin || !selectionPlugin || !annotationPlugin) {
    throw new Error(t({ message: "EmbedPDF did not initialize the required Reader plugins." }));
  }

  const capture = capturePlugin.provides();
  const scroll = scrollPlugin.provides();
  const viewport = registry.getPlugin<ViewportPlugin>(ViewportPlugin.id)?.provides() ?? null;
  const selection = selectionPlugin.provides();
  const annotationCapability = annotationPlugin.provides();
  const locate = host
    ? createPdfViewportLocator(host, (page, rect) => scroll.getRectPositionForPage(page, rect))
    : undefined;
  const annotationActivations = createEmbedPdfAnnotationActivations(annotationCapability, locate);
  // Subscribed first, so the decorations know of a click before Reader is told of it.
  const decorations = createPdfDecorationController(annotationCapability, annotationActivations);
  const subscriptions = new Set<Unsubscribe>();
  subscriptions.add(observePagePresses(host?.(), annotationActivations));
  const getDocument = (): Promise<PdfDocumentObject> => registryPdfDocument(registry);
  const navigation = createPdfPageNavigation(registry, scroll, getDocument);

  return {
    currentPageIndex: () => Math.max(0, scroll.getCurrentPage() - 1),
    pageCount: async () => (await getDocument()).pageCount,
    goToPage: navigation.goToPage,
    beginAreaSelection: () => capture.enableMarqueeCapture(),
    cancelAreaSelection: () => capture.disableMarqueeCapture(),
    onPageChanged(listener) {
      return trackSubscription(
        subscriptions,
        scroll.onPageChange((event) => listener(Math.max(0, event.pageNumber - 1))),
      );
    },
    ...(viewport
      ? {
          onScrolled: (listener: (scrollTop: number) => void) =>
            trackSubscription(
              subscriptions,
              viewport.onScrollChange((event) => listener(event.scrollMetrics.scrollTop)),
            ),
          onViewportResized: (listener: () => void) =>
            trackSubscription(
              subscriptions,
              viewport.onViewportResize(() => listener()),
            ),
        }
      : {}),
    onAreaSelected(listener) {
      return trackSubscription(
        subscriptions,
        capture.onCaptureArea((event) => listener(captureEventToAreaSelection(event))),
      );
    },
    onTextSelected: (listener) =>
      trackSubscription(
        subscriptions,
        observePdfSelection(selection, listener, adjustments, locate),
      ),
    onSelectionCleared(listener) {
      const stopSelection = selection.onSelectionChange((event) => {
        if (event.selection === null) {
          listener();
        }
      });
      // Hide the old toolbar/draft while a handle is moving, without clearing the PDF range.
      const stopAdjustments = adjustments?.subscribe((phase) => {
        if (phase === "start") {
          listener();
        }
      });
      const unsubscribe = (): void => {
        stopSelection();
        stopAdjustments?.();
      };
      subscriptions.add(unsubscribe);
      return () => {
        subscriptions.delete(unsubscribe);
        unsubscribe();
      };
    },
    onAnnotationActivated(listener) {
      return annotationActivations.subscribe(listener);
    },
    onAnnotationDismissed(listener) {
      return annotationActivations.subscribeDismissals(listener);
    },
    ...activationRect(annotationActivations, locate),
    clearTextSelection: () => selection.clear(),
    setAnnotations: (annotations) => decorations.setAnnotations(annotations),
    setActiveAnnotation: (annotation) => decorations.setActiveAnnotation(annotation),
    destroy() {
      navigation.destroy();
      decorations.destroy();
      annotationActivations.destroy();
      for (const unsubscribe of subscriptions) {
        unsubscribe();
      }
      subscriptions.clear();
    },
  };
}

function trackSubscription(subscriptions: Set<Unsubscribe>, stop: Unsubscribe): Unsubscribe {
  subscriptions.add(stop);
  return () => {
    subscriptions.delete(stop);
    stop();
  };
}

function registryPdfDocument(registry: PluginRegistry): Promise<PdfDocumentObject> {
  const manager = registry.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id);
  if (!manager) {
    return Promise.reject(new Error("EmbedPDF did not initialize its document manager."));
  }
  return activePdfDocument(manager.provides());
}

type DocumentManagerCapability = ReturnType<DocumentManagerPlugin["provides"]>;

async function activePdfDocument(documents: DocumentManagerCapability): Promise<PdfDocumentObject> {
  const active = documents.getActiveDocument();
  if (active) {
    return active;
  }
  return new Promise((resolve, reject) => {
    let unsubscribeOpened = (): void => undefined;
    let unsubscribeError = (): void => undefined;
    const finish = (settle: () => void): void => {
      unsubscribeOpened();
      unsubscribeError();
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
    const openedWhileSubscribing = documents.getActiveDocument();
    if (openedWhileSubscribing) {
      finish(() => resolve(openedWhileSubscribing));
    }
  });
}

/** Measures the highlight activated last, when the viewer can be measured at all. */
function activationRect(
  activations: EmbedPdfAnnotationActivations,
  locate: ((rects: readonly PdfPageRect[]) => ViewportRect | null) | undefined,
): Pick<EmbedPdfRuntime, "activationRect"> {
  if (!locate) {
    return {};
  }
  return {
    activationRect: () => {
      const activated = activations.activatedRect();
      return activated ? locate([activated]) : null;
    },
  };
}

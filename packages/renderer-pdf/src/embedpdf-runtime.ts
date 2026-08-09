import { AnnotationPlugin } from "@embedpdf/plugin-annotation";
import { SelectionPlugin, type FormattedSelection } from "@embedpdf/plugin-selection";
import { CapturePlugin, ScrollPlugin, type PluginRegistry } from "@embedpdf/react-pdf-viewer";

import { annotationToPdfDecoration } from "./pdf-decoration.js";

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

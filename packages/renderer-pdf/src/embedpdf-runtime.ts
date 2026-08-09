import { CapturePlugin, ScrollPlugin, type PluginRegistry } from "@embedpdf/react-pdf-viewer";

import type { CaptureAreaEvent } from "@embedpdf/plugin-capture";
import type { AreaSelectionDraft, Unsubscribe } from "@mdbase-reader/reading-surface";

export interface EmbedPdfRuntime {
  currentPageIndex(): number;
  goToPage(pageIndex: number): void;
  beginAreaSelection(): void;
  cancelAreaSelection(): void;
  onPageChanged(listener: (pageIndex: number) => void): Unsubscribe;
  onAreaSelected(listener: (selection: AreaSelectionDraft) => void): Unsubscribe;
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
    coordinateProfile: "embedpdf-pdf-points-v1",
    image: event.blob,
    imageType: event.imageType,
    scale: event.scale,
    withAnnotations: event.withAnnotations,
  };
}

export function createEmbedPdfRuntime(registry: PluginRegistry): EmbedPdfRuntime {
  const capturePlugin = registry.getPlugin<CapturePlugin>(CapturePlugin.id);
  const scrollPlugin = registry.getPlugin<ScrollPlugin>(ScrollPlugin.id);
  if (!capturePlugin || !scrollPlugin) {
    throw new Error("EmbedPDF did not initialize the required capture and scroll plugins.");
  }

  const capture = capturePlugin.provides();
  const scroll = scrollPlugin.provides();
  const subscriptions = new Set<Unsubscribe>();

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
    destroy() {
      for (const unsubscribe of subscriptions) {
        unsubscribe();
      }
      subscriptions.clear();
    },
  };
}

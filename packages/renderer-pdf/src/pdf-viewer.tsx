import { SelectionPlugin } from "@embedpdf/plugin-selection";
import {
  DocumentManagerPlugin,
  InteractionManagerPlugin,
  PDFViewer,
  type EmbedPdfContainer,
  type PluginRegistry,
} from "@embedpdf/react-pdf-viewer";
import { createEventEmitter } from "@mdbase-reader/reading-surface";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { suppressNativeCapturePreview } from "./embedpdf-native-capture-preview.js";
import { installReaderPdfChrome } from "./embedpdf-reader-chrome.js";
import { createEmbedPdfRuntime } from "./embedpdf-runtime.js";
import { installLongPressSelection } from "./pdf-long-press-selection.js";
import { EmbedPdfSurface } from "./pdf-surface.js";
import { installTouchSelectionHandles } from "./pdf-touch-selection-handles.js";
import { createReaderPdfViewerConfig, pdfPansByDefault } from "./pdf-viewer-policy.js";

import type { PdfSelectionAdjustment } from "./pdf-selection-publication.js";
import type { SurfaceDocument } from "@mdbase-reader/reading-surface";

export interface PdfViewerSurfaceProps {
  readonly document: SurfaceDocument;
  readonly className?: string;
  readonly onSurfaceReady: (surface: EmbedPdfSurface) => void;
  readonly onDocumentReady?: () => void;
  readonly onDocumentError?: (message: string) => void;
}

export function PdfViewerSurface({
  document,
  className,
  onSurfaceReady,
  onDocumentReady,
  onDocumentError,
}: PdfViewerSurfaceProps): React.JSX.Element {
  // Decided once per viewer: the config and the runtime must agree on the starting mode.
  const [pansByDefault] = useState(pdfPansByDefault);
  const viewerConfig = useMemo(
    () => createReaderPdfViewerConfig(document.url, pansByDefault),
    [document.url, pansByDefault],
  );
  const surfaceRef = useRef<EmbedPdfSurface | null>(null);
  const subscriptionsRef = useRef<(() => void)[]>([]);
  const nativeUiCleanupRef = useRef<(() => void) | null>(null);
  const containerRef = useRef<EmbedPdfContainer | null>(null);
  const clearRuntime = useCallback(() => {
    for (const unsubscribe of subscriptionsRef.current) {
      unsubscribe();
    }
    subscriptionsRef.current = [];
    void surfaceRef.current?.destroy();
    surfaceRef.current = null;
  }, []);
  const clearViewer = useCallback(() => {
    clearRuntime();
    nativeUiCleanupRef.current?.();
    nativeUiCleanupRef.current = null;
  }, [clearRuntime]);
  const handleReady = useCallback(
    (registry: PluginRegistry) => {
      clearRuntime();
      try {
        const adjustments = createEventEmitter<PdfSelectionAdjustment>();
        const surface = new EmbedPdfSurface(document, createEmbedPdfRuntime(registry, adjustments));
        surfaceRef.current = surface;
        onSurfaceReady(surface);

        const manager = registry.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id);
        if (!manager) {
          throw new Error("EmbedPDF did not initialize its document manager.");
        }
        const documents = manager.provides();
        subscriptionsRef.current = [
          documents.onDocumentOpened(() => onDocumentReady?.()),
          documents.onDocumentError(({ message }) => onDocumentError?.(message)),
          ...(pansByDefault && containerRef.current
            ? [
                // Handle capture listeners must run before the long-press recognizer.
                installTouchSelectionHandles({
                  host: containerRef.current,
                  registry,
                  adjustment: (phase) => adjustments.emit(phase),
                }),
                longPressSelection(registry, containerRef.current),
              ]
            : []),
        ];
        const current = documents.getOpenDocuments()[0];
        if (current?.status === "loaded") {
          onDocumentReady?.();
        } else if (current?.status === "error") {
          onDocumentError?.(current.error ?? "EmbedPDF could not open this PDF.");
        }
      } catch (reason) {
        onDocumentError?.(reason instanceof Error ? reason.message : String(reason));
      }
    },
    [clearRuntime, document, onDocumentError, onDocumentReady, onSurfaceReady, pansByDefault],
  );

  useEffect(() => () => clearViewer(), [clearViewer]);

  const handleInit = useCallback((container: EmbedPdfContainer): void => {
    containerRef.current = container;
    nativeUiCleanupRef.current?.();
    const cleanups = [suppressNativeCapturePreview(container), installReaderPdfChrome(container)];
    nativeUiCleanupRef.current = () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, []);

  return (
    <PDFViewer
      {...(className === undefined ? {} : { className })}
      config={viewerConfig}
      onInit={handleInit}
      onReady={handleReady}
      style={{ height: "100%", width: "100%" }}
    />
  );
}

/** Where a finger pans the PDF, holding it on the text selects instead; see the gesture. */
function longPressSelection(
  registry: PluginRegistry,
  container: EmbedPdfContainer | null,
): () => void {
  const interaction = registry.getPlugin<InteractionManagerPlugin>(InteractionManagerPlugin.id);
  const selection = registry.getPlugin<SelectionPlugin>(SelectionPlugin.id);
  if (!container || !interaction || !selection) {
    return () => undefined;
  }
  const modes = interaction.provides();
  return installLongPressSelection({
    host: container,
    modes: {
      select: () => modes.activate("pointerMode"),
      pan: () => modes.activateDefaultMode(),
    },
    selection: selection.provides(),
  });
}

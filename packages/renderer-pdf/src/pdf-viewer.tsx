import {
  DocumentManagerPlugin,
  PDFViewer,
  type EmbedPdfContainer,
  type PluginRegistry,
} from "@embedpdf/react-pdf-viewer";
import { useCallback, useEffect, useRef } from "react";

import { suppressNativeCapturePreview } from "./embedpdf-native-capture-preview.js";
import { createEmbedPdfRuntime } from "./embedpdf-runtime.js";
import { EmbedPdfSurface } from "./pdf-surface.js";

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
  const surfaceRef = useRef<EmbedPdfSurface | null>(null);
  const subscriptionsRef = useRef<(() => void)[]>([]);
  const nativeUiCleanupRef = useRef<(() => void) | null>(null);
  const clearRuntime = useCallback(() => {
    for (const unsubscribe of subscriptionsRef.current) {
      unsubscribe();
    }
    subscriptionsRef.current = [];
    nativeUiCleanupRef.current?.();
    nativeUiCleanupRef.current = null;
    void surfaceRef.current?.destroy();
    surfaceRef.current = null;
  }, []);
  const handleReady = useCallback(
    (registry: PluginRegistry) => {
      clearRuntime();
      try {
        const surface = new EmbedPdfSurface(document, createEmbedPdfRuntime(registry));
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
    [clearRuntime, document, onDocumentError, onDocumentReady, onSurfaceReady],
  );

  useEffect(() => () => clearRuntime(), [clearRuntime]);

  const handleInit = useCallback((container: EmbedPdfContainer): void => {
    nativeUiCleanupRef.current?.();
    nativeUiCleanupRef.current = suppressNativeCapturePreview(container);
  }, []);

  return (
    <PDFViewer
      {...(className === undefined ? {} : { className })}
      config={{ src: document.url }}
      onInit={handleInit}
      onReady={handleReady}
      style={{ height: "100%", width: "100%" }}
    />
  );
}

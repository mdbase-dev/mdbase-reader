import { DocumentManagerPlugin, PDFViewer, type PluginRegistry } from "@embedpdf/react-pdf-viewer";
import { useCallback, useEffect, useRef } from "react";

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
  const clearRuntime = useCallback(() => {
    for (const unsubscribe of subscriptionsRef.current) {
      unsubscribe();
    }
    subscriptionsRef.current = [];
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

  return (
    <PDFViewer
      {...(className === undefined ? {} : { className })}
      config={{ src: document.url }}
      onReady={handleReady}
      style={{ height: "100%", width: "100%" }}
    />
  );
}

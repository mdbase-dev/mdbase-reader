import { PDFViewer, type PluginRegistry } from "@embedpdf/react-pdf-viewer";
import { useCallback, useEffect, useRef } from "react";

import { createEmbedPdfRuntime } from "./embedpdf-runtime.js";
import { EmbedPdfSurface } from "./pdf-surface.js";

import type { SurfaceDocument } from "@mdbase-reader/reading-surface";

export interface PdfViewerSurfaceProps {
  readonly document: SurfaceDocument;
  readonly className?: string;
  readonly onSurfaceReady: (surface: EmbedPdfSurface) => void;
}

export function PdfViewerSurface({
  document,
  className,
  onSurfaceReady,
}: PdfViewerSurfaceProps): React.JSX.Element {
  const surfaceRef = useRef<EmbedPdfSurface | null>(null);
  const handleReady = useCallback(
    (registry: PluginRegistry) => {
      void surfaceRef.current?.destroy();
      const surface = new EmbedPdfSurface(document, createEmbedPdfRuntime(registry));
      surfaceRef.current = surface;
      onSurfaceReady(surface);
    },
    [document, onSurfaceReady],
  );

  useEffect(
    () => () => {
      void surfaceRef.current?.destroy();
      surfaceRef.current = null;
    },
    [],
  );

  return (
    <PDFViewer
      {...(className === undefined ? {} : { className })}
      config={{ src: document.url }}
      onReady={handleReady}
      style={{ height: "100%", width: "100%" }}
    />
  );
}

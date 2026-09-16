import { useEffect, useRef, useState } from "react";

import { EpubPageNavigation } from "./epub-page-navigation.js";
import { prepareEpubPublication, type PreparedEpubPublication } from "./epub-resource-store.js";
import { ReadiumEpubSurface } from "./epub-surface.js";
import { createReadiumRuntime, type ReadiumRuntime } from "./readium-runtime.js";

import type { SurfaceDocument } from "@mdbase-reader/reading-surface";

export interface EpubViewerSurfaceProps {
  readonly document: SurfaceDocument;
  readonly className?: string;
  readonly onSurfaceReady: (surface: ReadiumEpubSurface) => void;
  readonly onDocumentReady?: () => void;
  readonly onDocumentError?: (message: string) => void;
}

export function EpubViewerSurface({
  document,
  className,
  onSurfaceReady,
  onDocumentReady,
  onDocumentError,
}: EpubViewerSurfaceProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [readyRuntime, setReadyRuntime] = useState<ReadiumRuntime | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }
    const lifetime = new AbortController();
    let publication: PreparedEpubPublication | null = null;
    let surface: ReadiumEpubSurface | null = null;
    const open = async (): Promise<void> => {
      try {
        const response = await fetch(document.url, { signal: lifetime.signal });
        if (!response.ok) {
          throw new Error(`EPUB download failed with HTTP ${String(response.status)}.`);
        }
        publication = await prepareEpubPublication(await response.blob());
        if (isAborted(lifetime.signal)) {
          await publication.close();
          publication = null;
          return;
        }
        const runtime = await createReadiumRuntime({
          container,
          manifest: publication.manifest,
          publicationBaseUrl: publication.baseUrl,
        });
        if (isAborted(lifetime.signal)) {
          await runtime.destroy();
          await publication.close();
          publication = null;
          return;
        }
        surface = new ReadiumEpubSurface(document, runtime);
        setReadyRuntime(runtime);
        onSurfaceReady(surface);
        onDocumentReady?.();
      } catch (reason) {
        if (!isAborted(lifetime.signal)) {
          onDocumentError?.(reason instanceof Error ? reason.message : String(reason));
        }
      }
    };
    void open();
    return () => {
      lifetime.abort();
      const closingSurface = surface;
      const closingPublication = publication;
      surface = null;
      publication = null;
      void (async () => {
        await closingSurface?.destroy();
        await closingPublication?.close();
      })();
    };
  }, [document, onDocumentError, onDocumentReady, onSurfaceReady]);

  return (
    <div className={className}>
      <EpubPageNavigation runtime={readyRuntime} />
      <div ref={containerRef} className="epub-publication" />
    </div>
  );
}

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

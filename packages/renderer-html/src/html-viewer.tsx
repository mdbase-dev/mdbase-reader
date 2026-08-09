import { useEffect, useRef } from "react";

import { prepareHtmlDocument } from "./html-document.js";
import { HtmlDocumentRuntime } from "./html-runtime.js";
import { HtmlReadingSurface } from "./html-surface.js";

import type { SurfaceDocument } from "@mdbase-reader/reading-surface";

export interface HtmlViewerSurfaceProps {
  readonly document: SurfaceDocument;
  readonly className?: string;
  readonly onSurfaceReady: (surface: HtmlReadingSurface) => void;
  readonly onDocumentReady?: () => void;
  readonly onDocumentError?: (message: string) => void;
}

export function HtmlViewerSurface({
  document,
  className,
  onSurfaceReady,
  onDocumentReady,
  onDocumentError,
}: HtmlViewerSurfaceProps): React.JSX.Element {
  const frameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return undefined;
    }
    const lifetime = new AbortController();
    let surface: HtmlReadingSurface | null = null;
    const open = async (): Promise<void> => {
      try {
        const response = await fetch(document.url, { signal: lifetime.signal });
        if (!response.ok) {
          throw new Error(`HTML download failed with HTTP ${String(response.status)}.`);
        }
        const prepared = prepareHtmlDocument(await response.text());
        await loadFrame(frame, prepared, lifetime.signal);
        if (lifetime.signal.aborted) {
          return;
        }
        surface = new HtmlReadingSurface(
          document,
          new HtmlDocumentRuntime(frame, document.document.file),
        );
        onSurfaceReady(surface);
        onDocumentReady?.();
      } catch (reason) {
        if (!lifetime.signal.aborted) {
          onDocumentError?.(reason instanceof Error ? reason.message : String(reason));
        }
      }
    };
    void open();
    return () => {
      lifetime.abort();
      void surface?.destroy();
      surface = null;
      frame.srcdoc = "";
    };
  }, [document, onDocumentError, onDocumentReady, onSurfaceReady]);
  return (
    <iframe
      ref={frameRef}
      className={className}
      sandbox="allow-same-origin"
      title="HTML reading document"
    />
  );
}

function loadFrame(frame: HTMLIFrameElement, document: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const loaded = (): void => {
      cleanup();
      resolve();
    };
    const aborted = (): void => {
      cleanup();
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException("The HTML document load was cancelled.", "AbortError"),
      );
    };
    const cleanup = (): void => {
      frame.removeEventListener("load", loaded);
      signal.removeEventListener("abort", aborted);
    };
    frame.addEventListener("load", loaded, { once: true });
    signal.addEventListener("abort", aborted, { once: true });
    frame.srcdoc = document;
  });
}

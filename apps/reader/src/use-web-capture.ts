import { useCallback, useRef, useState } from "react";

import { readerErrorMessage } from "./errors.js";

import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { SourceId } from "@mdbase-reader/core";

export interface WebCaptureFlow {
  readonly status: "idle" | "capturing";
  readonly error: string | null;
  readonly capture: (url: string) => Promise<void>;
  readonly clearError: () => void;
}

export function useWebCapture(
  workspace: ReaderWorkspaceController,
  onImported: (sourceId: SourceId) => void,
): WebCaptureFlow {
  const [status, setStatus] = useState<WebCaptureFlow["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const recoveryUrl = useRef<string | null>(null);
  const capture = useCallback(
    async (url: string): Promise<void> => {
      setStatus("capturing");
      setError(null);
      try {
        // Readability and the metadata extractors load only when a page is captured.
        const { fetchWebCapture } = await import("./web-capture-client.js");
        const captured = await fetchWebCapture(url);
        const imported = await workspace.importSourceFile(
          {
            name: captured.name,
            declaredMediaType: "text/html",
            bytes: captured.bytes,
            title: captured.title,
            capture: captured.capture,
            archive: captured.archive,
            metadata: captured.metadata,
          },
          recoveryUrl.current === url ? { recoverExistingFiles: true } : {},
        );
        if (imported) {
          recoveryUrl.current = null;
          onImported(imported.id);
        } else {
          recoveryUrl.current = url;
        }
      } catch (reason) {
        setError(readerErrorMessage(reason, "Reader could not capture that page."));
      } finally {
        setStatus("idle");
      }
    },
    [onImported, workspace],
  );
  return {
    status,
    error: error ?? workspace.importError,
    capture,
    clearError: () => setError(null),
  };
}

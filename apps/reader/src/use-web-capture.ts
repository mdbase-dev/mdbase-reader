import { useCallback, useState } from "react";

import { readerErrorMessage } from "./errors.js";
import { fetchWebCapture } from "./web-capture-client.js";

import type { ReaderWorkspaceController } from "./use-reader-workspace.js";

export interface WebCaptureFlow {
  readonly status: "idle" | "capturing";
  readonly error: string | null;
  readonly capture: (url: string) => Promise<void>;
  readonly clearError: () => void;
}

export function useWebCapture(
  workspace: ReaderWorkspaceController,
  onImported: () => void,
): WebCaptureFlow {
  const [status, setStatus] = useState<WebCaptureFlow["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const capture = useCallback(
    async (url: string): Promise<void> => {
      setStatus("capturing");
      setError(null);
      try {
        const captured = await fetchWebCapture(url);
        const imported = await workspace.importSourceFile({
          name: captured.name,
          declaredMediaType: "text/html",
          bytes: captured.bytes,
          title: captured.title,
          capture: captured.capture,
        });
        if (imported) {
          onImported();
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

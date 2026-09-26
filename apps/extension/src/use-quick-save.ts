import { useEffect, useRef } from "react";

import type { CaptureIntent } from "./messages.js";
import type { PageCapture } from "./page-capture.js";
import type { CaptureDraft } from "./save-capture.js";

/** A quick save from the context menu or shortcut waits this long for the panel to be ready. */
const quickSaveWindowMs = 60_000;

/**
 * "Save highlight" from the context menu or shortcut saves as soon as the panel is ready
 * (connected, existing source looked up, citation settled), with the reader's last colour.
 * Once ready, the request is used up whether or not there was a passage to save.
 */
export function useQuickSave({
  invocation,
  ready: pageReady,
  busy,
  capture,
  title,
  save,
}: {
  readonly invocation: { readonly intent: CaptureIntent; readonly at: number } | null;
  readonly ready: boolean;
  /** Another action is running, or the tab has left the page. */
  readonly busy: boolean;
  readonly capture: PageCapture | null;
  readonly title: string;
  readonly save: (changes: Partial<CaptureDraft>) => Promise<void>;
}): void {
  const handled = useRef<number | null>(null);
  const ready = pageReady && !busy;
  const selection = capture?.kind === "html" ? capture.selection : null;
  const latestSave = useRef(save);
  useEffect(() => {
    latestSave.current = save;
  });
  useEffect(() => {
    if (invocation?.intent !== "highlight" || !ready || handled.current === invocation.at) {
      return;
    }
    handled.current = invocation.at;
    if (selection && title.trim() && Date.now() - invocation.at < quickSaveWindowMs) {
      void latestSave.current({ highlight: true });
    }
  }, [invocation, ready, selection, title]);
}

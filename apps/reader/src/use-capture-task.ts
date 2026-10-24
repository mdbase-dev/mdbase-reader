import { useCallback, useEffect, useRef, useState } from "react";

interface CaptureTask {
  readonly signal: AbortSignal;
  readonly onStatus: (message: string) => void;
  readonly onWriteStart: () => void;
  readonly isCurrent: () => boolean;
  readonly finish: () => void;
}

/** Cancellation releases the UI immediately; late results cannot update it or begin a write. */
export function useCaptureTask(): {
  status: "idle" | "capturing";
  progress: string | null;
  canCancel: boolean;
  cancel: () => void;
  begin: () => CaptureTask | null;
} {
  const [status, setStatus] = useState<"idle" | "capturing">("idle");
  const [progress, setProgress] = useState<string | null>(null);
  const [canCancel, setCanCancel] = useState(false);
  const active = useRef<{ controller: AbortController; writing: boolean } | null>(null);
  const cancel = useCallback((): void => {
    if (!active.current || active.current.writing) {
      return;
    }
    active.current.controller.abort();
    active.current = null;
    setCanCancel(false);
    setStatus("idle");
    setProgress(null);
  }, []);
  useEffect(
    () => () => {
      if (active.current && !active.current.writing) {
        active.current.controller.abort();
        active.current = null;
      }
    },
    [],
  );
  const begin = useCallback((): CaptureTask | null => {
    if (active.current) {
      return null;
    }
    const operation = { controller: new AbortController(), writing: false };
    active.current = operation;
    setCanCancel(true);
    setStatus("capturing");
    return {
      signal: operation.controller.signal,
      isCurrent: () => active.current === operation,
      onStatus: (message) => {
        if (active.current === operation) {
          setProgress(message);
        }
      },
      onWriteStart: () => {
        operation.writing = true;
        setCanCancel(false);
      },
      finish: () => {
        if (active.current === operation) {
          active.current = null;
          setCanCancel(false);
          setStatus("idle");
          setProgress(null);
        }
      },
    };
  }, []);
  return { status, progress, canCancel, cancel, begin };
}

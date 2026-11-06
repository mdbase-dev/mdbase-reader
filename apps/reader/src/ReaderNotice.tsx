import { claimFrameShortcut } from "@mdbase-reader/reading-surface";
import { useEffect, useRef, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ReaderNotice({
  children,
  onUndo,
  ...props
}: {
  readonly children: ReactNode;
  readonly onUndo?: (() => void) | undefined;
  readonly onPointerEnter?: () => void;
  readonly onPointerLeave?: () => void;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
}): JSX.Element | null {
  const host = typeof document === "undefined" ? null : document.getElementById("reader-notices");
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onUndo) {
      return;
    }
    const release = claimFrameShortcut(document, "undo");
    const undo = (event: KeyboardEvent): void => {
      const target = event.composedPath()[0];
      const top = document.querySelector("#reader-notices > :last-child");
      if (
        (top && top !== noticeRef.current) ||
        event.defaultPrevented ||
        document.querySelector("dialog[open]") ||
        (target instanceof Element &&
          target.closest("input, textarea, select, [contenteditable=true]"))
      ) {
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        onUndo();
      }
    };
    document.addEventListener("keydown", undo, true);
    return () => {
      release();
      document.removeEventListener("keydown", undo, true);
    };
  }, [onUndo]);
  const notice = (
    <div ref={noticeRef} className="highlight-saved" {...props}>
      {children}
    </div>
  );
  return host ? createPortal(notice, host) : notice;
}

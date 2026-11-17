import { useEffect, type RefObject } from "react";

/** Input inside an iframe never reaches the page around it. Observe input without injecting scripts or relaxing sandboxing. */
export function useDockPanelFocus(host: RefObject<HTMLElement | null>, activate: () => void): void {
  useEffect(() => {
    const element = host.current;
    if (!element) {
      return undefined;
    }
    return observePanelInput(element, activate);
  }, [host, activate]);
}

function observePanelInput(root: HTMLElement | Document, activate: () => void): () => void {
  const frames = new Map<HTMLIFrameElement, () => void>();
  root.addEventListener("pointerdown", activate, true);
  root.addEventListener("focusin", activate, true);
  const scan = (): void => {
    const available = new Set(root.querySelectorAll<HTMLIFrameElement>("iframe"));
    for (const [frame, dispose] of frames) {
      if (!available.has(frame)) {
        dispose();
        frames.delete(frame);
      }
    }
    for (const frame of available) {
      if (frames.has(frame)) {
        continue;
      }
      let disposeDocument: (() => void) | undefined;
      const loaded = (): void => {
        disposeDocument?.();
        disposeDocument = undefined;
        try {
          if (frame.contentDocument) {
            const stopInput = observePanelInput(frame.contentDocument, activate);
            const stopZoom = forwardCanvasZoom(frame, frame.contentDocument);
            disposeDocument = () => {
              stopInput();
              stopZoom();
            };
          }
        } catch {
          /* Cross-origin embedded content is deliberately inaccessible. */
        }
      };
      frame.addEventListener("load", loaded);
      loaded();
      frames.set(frame, () => {
        frame.removeEventListener("load", loaded);
        disposeDocument?.();
      });
    }
  };
  const observer = new MutationObserver(scan);
  observer.observe(root, { childList: true, subtree: true });
  scan();
  return () => {
    observer.disconnect();
    root.removeEventListener("pointerdown", activate, true);
    root.removeEventListener("focusin", activate, true);
    for (const dispose of frames.values()) {
      dispose();
    }
  };
}

/**
 * On the canvas, Ctrl or Cmd with the wheel zooms the workspace. Inside a document's frame the
 * browser would zoom the whole page instead, so the gesture is handed to the workspace around it.
 */
function forwardCanvasZoom(frame: HTMLIFrameElement, content: Document): () => void {
  const wheel = (event: WheelEvent): void => {
    if (!(event.ctrlKey || event.metaKey) || !frame.closest('[data-mp-view="canvas"]')) {
      return;
    }
    event.preventDefault();
    // The frame is drawn at the canvas's zoom, so its own coordinates are scaled to the page's.
    const bounds = frame.getBoundingClientRect();
    const scale = frame.clientWidth ? bounds.width / frame.clientWidth : 1;
    frame.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        clientX: bounds.left + event.clientX * scale,
        clientY: bounds.top + event.clientY * scale,
      }),
    );
  };
  content.addEventListener("wheel", wheel, { passive: false });
  return () => content.removeEventListener("wheel", wheel);
}

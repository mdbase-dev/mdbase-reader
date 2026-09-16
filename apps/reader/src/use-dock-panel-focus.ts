import { useEffect, type RefObject } from "react";

/** Iframe input does not bubble to Dockview. Observe input without injecting scripts or relaxing sandboxing. */
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
            disposeDocument = observePanelInput(frame.contentDocument, activate);
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

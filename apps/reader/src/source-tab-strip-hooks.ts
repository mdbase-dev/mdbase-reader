import { useEffect, useLayoutEffect } from "react";

import type { WorkspaceTab } from "./source-workspace-layout.js";
import type { RefObject } from "react";

export function useTabOverflow(
  trackRef: RefObject<HTMLDivElement | null>,
  setOverflowing: (overflowing: boolean) => void,
  tabCount: number,
): void {
  useEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return undefined;
    }
    const update = (): void => setOverflowing(track.scrollWidth > track.clientWidth + 2);
    const observer = new ResizeObserver(update);
    observer.observe(track);
    globalThis.requestAnimationFrame(update);
    return () => observer.disconnect();
  }, [setOverflowing, tabCount, trackRef]);
}

export function useKeepActiveTabVisible(
  trackRef: RefObject<HTMLDivElement | null>,
  activeTabId: WorkspaceTab["id"] | null,
): void {
  useLayoutEffect(() => {
    trackRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId, trackRef]);
}

export function useDismissTabMenus(
  first: RefObject<HTMLDetailsElement | null>,
  second: RefObject<HTMLDetailsElement | null>,
): void {
  useEffect(() => {
    const menus = [first, second];
    const close = (event: PointerEvent | globalThis.KeyboardEvent): void => {
      if (event instanceof globalThis.KeyboardEvent && event.key !== "Escape") {
        return;
      }
      for (const menu of menus) {
        if (event instanceof PointerEvent && menu.current?.contains(event.target as Node)) {
          continue;
        }
        menu.current?.removeAttribute("open");
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [first, second]);
}

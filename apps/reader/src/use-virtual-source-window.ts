import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  SOURCE_LIST_PADDING_END,
  SOURCE_LIST_PADDING_START,
  SOURCE_ROW_HEIGHT,
  virtualSourceRange,
} from "./virtual-source-list.js";

import type { VirtualSourceRange } from "./virtual-source-list.js";
import type { RefObject } from "react";

export interface VirtualSourceWindow {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly range: VirtualSourceRange;
  readonly measure: () => void;
  readonly focusIndex: (index: number) => void;
}

interface ViewportMetrics {
  readonly scrollTop: number;
  readonly height: number;
}

export function useVirtualSourceWindow(itemCount: number, resetKey: string): VirtualSourceWindow {
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingFocusIndex = useRef<number | null>(null);
  const [viewport, setViewport] = useState<ViewportMetrics>({ scrollTop: 0, height: 0 });
  const range = useMemo(
    () =>
      virtualSourceRange({
        itemCount,
        scrollTop: viewport.scrollTop,
        viewportHeight: viewport.height,
      }),
    [itemCount, viewport],
  );

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      setViewport({ scrollTop: container.scrollTop, height: container.clientHeight });
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = 0;
      measure();
    }
  }, [measure, resetKey]);

  const focusIndex = useCallback(
    (index: number) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      pendingFocusIndex.current = index;
      revealSourceRow(container, index);
      measure();
      if (focusRenderedRow(container, index)) {
        pendingFocusIndex.current = null;
      }
    },
    [measure],
  );

  useEffect(() => {
    const index = pendingFocusIndex.current;
    const container = containerRef.current;
    if (index === null || !container || index < range.start || index >= range.end) {
      return;
    }
    focusRenderedRow(container, index);
    pendingFocusIndex.current = null;
  }, [range.end, range.start]);

  return { containerRef, range, measure, focusIndex };
}

function revealSourceRow(container: HTMLDivElement, index: number): void {
  const rowTop = SOURCE_LIST_PADDING_START + index * SOURCE_ROW_HEIGHT;
  const rowBottom = rowTop + SOURCE_ROW_HEIGHT;
  if (rowTop < container.scrollTop) {
    container.scrollTop = rowTop - SOURCE_LIST_PADDING_START;
  } else if (rowBottom > container.scrollTop + container.clientHeight) {
    container.scrollTop = rowBottom - container.clientHeight + SOURCE_LIST_PADDING_END;
  }
}

function focusRenderedRow(container: HTMLDivElement, index: number): boolean {
  const row = container.querySelector<HTMLElement>(`[data-source-index="${String(index)}"]`);
  row?.focus();
  return Boolean(row);
}

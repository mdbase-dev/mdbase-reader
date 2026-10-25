import { defaultRangeExtractor, useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";

import { annotationItemControls } from "./annotation-list-keyboard.js";

import type { Annotation, AnnotationId } from "@mdbase-reader/core";

interface AnnotationWindowOptions {
  readonly results: readonly Annotation[];
  readonly editingId: AnnotationId | null;
  readonly activeId: AnnotationId | null;
  readonly readingId: AnnotationId | null;
  readonly renderAll: boolean;
  /** Following is owned by the list so its control can live in the Filter menu. */
  readonly following: boolean;
  readonly setFollowing: (following: boolean) => void;
}
interface WindowFocus {
  readonly focusedId: string | null;
  readonly setFocusedId: Dispatch<SetStateAction<string | null>>;
  readonly focusItem: (index: number, last?: boolean) => void;
}
interface AnnotationWindow extends WindowFocus {
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
  readonly pause: () => void;
}
export function useAnnotationWindow({
  results,
  editingId,
  activeId,
  readingId,
  renderAll,
  following,
  setFollowing,
}: AnnotationWindowOptions): AnnotationWindow {
  const scrollRef = useRef<HTMLDivElement>(null);
  const focus = useWindowFocus(results, scrollRef);
  const editingIndex = results.findIndex(({ id }) => id === editingId);
  const focusedIndex = results.findIndex(({ id }) => id === focus.focusedId);
  const readingIndex = results.findIndex(({ id }) => id === readingId);
  const rangeExtractor = useCallback(
    (range: Parameters<typeof defaultRangeExtractor>[0]) =>
      [
        ...new Set([
          ...defaultRangeExtractor(range),
          ...[editingIndex, focusedIndex].filter((index) => index >= 0),
        ]),
      ].sort((a, b) => a - b),
    [editingIndex, focusedIndex],
  );
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200,
    initialRect: { width: 0, height: 600 },
    getItemKey: (index) => results[index]?.id ?? index,
    overscan: 4,
    rangeExtractor,
    enabled: !renderAll,
  });
  const reveal = useCallback(
    (index: number): void => {
      if (index < 0 || scrollRef.current?.closest('[hidden], [inert], [aria-hidden="true"]')) {
        return;
      }
      if (renderAll) {
        scrollRef.current
          ?.querySelector<HTMLElement>(`[data-index="${String(index)}"]`)
          ?.scrollIntoView({ block: "nearest" });
      } else {
        virtualizer.scrollToIndex(index, { align: "auto" });
      }
    },
    [renderAll, virtualizer],
  );
  const activeIndex = results.findIndex(({ id }) => id === activeId);
  // Passive reading never steals an editor/focused card or a manually browsed list. Resuming
  // following reveals the reading position through this effect too.
  useEffect(() => {
    if (following && !editingId && !focus.focusedId) {
      reveal(readingIndex);
    }
  }, [readingId, readingIndex, following, editingId, focus.focusedId, reveal]);
  // Explicit document selection wins if it arrives in the same commit as reading context.
  useEffect(() => {
    reveal(activeIndex);
  }, [activeId, activeIndex, reveal]);
  return {
    scrollRef,
    virtualizer,
    focusedId: focus.focusedId,
    setFocusedId: focus.setFocusedId,
    pause: (): void => setFollowing(false),
    focusItem: (index: number, last = false): void => {
      if (!results[index]) {
        return;
      }
      setFollowing(false);
      focus.focusItem(index, last);
      reveal(index);
    },
  };
}
function useWindowFocus(
  results: readonly Annotation[],
  scrollRef: RefObject<HTMLDivElement | null>,
): WindowFocus {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const pendingFocus = useRef<{ index: number; last: boolean } | null>(null);
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) {
      return;
    }
    const item = scrollRef.current?.querySelector<HTMLElement>(
      `[data-index="${String(target.index)}"]`,
    );
    if (item) {
      (target.last ? (annotationItemControls(item).at(-1) ?? item) : item).focus({
        preventScroll: true,
      });
      pendingFocus.current = null;
    }
  });
  return {
    focusedId,
    setFocusedId,
    focusItem: (index: number, last = false): void => {
      const annotation = results[index];
      if (annotation) {
        pendingFocus.current = { index, last };
        setFocusedId(annotation.id);
      }
    },
  };
}

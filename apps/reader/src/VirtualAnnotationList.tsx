import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef, useState, type JSX, type ReactNode } from "react";

import type { Annotation, AnnotationId } from "@mdbase-reader/core";

/** Measured cards with viewport-only asset loading and pinned editors/keyboard focus. */
export function VirtualAnnotationList({
  results,
  editingId,
  activeId,
  renderCard,
  children,
}: {
  readonly results: readonly Annotation[];
  readonly editingId: AnnotationId | null;
  readonly activeId: AnnotationId | null;
  readonly renderCard: (annotation: Annotation) => ReactNode;
  readonly children?: ReactNode;
}): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const editingIndex = results.findIndex(({ id }) => id === editingId);
  const focusedIndex = results.findIndex(({ id }) => id === focusedId);
  const rangeExtractor = useCallback(
    (range: Parameters<typeof defaultRangeExtractor>[0]) => {
      return [
        ...new Set([
          ...defaultRangeExtractor(range),
          ...[editingIndex, focusedIndex].filter((index) => index >= 0),
        ]),
      ].sort((a, b) => a - b);
    },
    [editingIndex, focusedIndex],
  );
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200,
    // Render a bounded first window before the scroll element is measured (including SSR).
    initialRect: { width: 0, height: 600 },
    getItemKey: (index) => results[index]?.id ?? index,
    overscan: 4,
    rangeExtractor,
  });
  const activeIndex = results.findIndex(({ id }) => id === activeId);
  useEffect(() => {
    if (
      activeIndex >= 0 &&
      !scrollRef.current?.closest('[hidden], [inert], [aria-hidden="true"]')
    ) {
      virtualizer.scrollToIndex(activeIndex, { align: "auto" });
    }
  }, [activeId, activeIndex, virtualizer]);
  return (
    <div
      className="annotation-list"
      ref={scrollRef}
      onFocusCapture={(event) =>
        setFocusedId(
          event.target.closest<HTMLElement>("[data-annotation-id]")?.dataset["annotationId"] ??
            null,
        )
      }
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocusedId(null);
        }
      }}
    >
      {children}
      <div
        role="list"
        aria-label="Annotations"
        style={{ height: virtualizer.getTotalSize(), position: "relative" }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const annotation = results[item.index];
          return annotation ? (
            <div
              key={annotation.id}
              role="listitem"
              aria-posinset={item.index + 1}
              aria-setsize={results.length}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${String(item.start)}px)`,
              }}
            >
              {renderCard(annotation)}
            </div>
          ) : null;
        })}
      </div>
    </div>
  );
}

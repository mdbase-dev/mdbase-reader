import { useId, type JSX, type ReactNode } from "react";

import { annotationListKeyDown } from "./annotation-list-keyboard.js";
import { useAnnotationWindow } from "./use-annotation-window.js";

import type { Annotation, AnnotationId } from "@mdbase-reader/core";

/** Measured cards; at most one editor and one keyboard focus are pinned outside the window. */
export function VirtualAnnotationList({
  results,
  editingId,
  activeId,
  readingId = null,
  renderAll = false,
  renderCard,
  children,
}: {
  readonly results: readonly Annotation[];
  readonly editingId: AnnotationId | null;
  readonly activeId: AnnotationId | null;
  readonly readingId?: AnnotationId | null;
  readonly renderAll?: boolean;
  readonly renderCard: (annotation: Annotation) => ReactNode;
  readonly children?: ReactNode;
}): JSX.Element {
  const {
    scrollRef,
    reading,
    following,
    toggleFollowing,
    pause,
    focusItem,
    setFocusedId,
    virtualizer,
  } = useAnnotationWindow({ results, editingId, activeId, readingId, renderAll });
  return (
    <>
      {reading ? (
        <div className="annotation-reading-context">
          <span>
            Near reading position:{" "}
            {reading.locator?.label.replace(/^\[\[.*\]\]$/u, "Document passage") ??
              "Document passage"}
          </span>
          <button type="button" aria-pressed={following} onClick={toggleFollowing}>
            {following ? "Pause following" : "Follow reading"}
          </button>
        </div>
      ) : null}
      {/* Delegated keyboard handling serves the focusable listitems, not an interactive listbox. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        className="annotation-list"
        ref={scrollRef}
        tabIndex={-1}
        onWheel={pause}
        onTouchMove={pause}
        onPointerDown={pause}
        onKeyDown={(event) => annotationListKeyDown(event, results.length, focusItem, pause)}
        onFocusCapture={(event) =>
          setFocusedId(
            event.target.closest<HTMLElement>("[data-item-id]")?.dataset["itemId"] ?? null,
          )
        }
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setFocusedId(null);
          }
        }}
      >
        {children}
        <AnnotationWindowItems
          results={results}
          readingId={readingId}
          renderAll={renderAll}
          virtualizer={virtualizer}
          renderCard={renderCard}
        />
      </div>
    </>
  );
}
function AnnotationWindowItems({
  results,
  readingId,
  renderAll,
  virtualizer,
  renderCard,
}: {
  readonly results: readonly Annotation[];
  readonly readingId: AnnotationId | null;
  readonly renderAll: boolean;
  readonly virtualizer: ReturnType<typeof useAnnotationWindow>["virtualizer"];
  readonly renderCard: (annotation: Annotation) => ReactNode;
}): JSX.Element {
  const instructions = useId();
  const items = renderAll
    ? results.map((annotation, index) => ({ key: annotation.id, index, start: 0 }))
    : virtualizer.getVirtualItems();
  return (
    <>
      <span className="sr-only" id={instructions}>
        Use Up and Down to move between annotations, Home and End for the first and last. Tab moves
        through card actions.
      </span>
      <div
        role="list"
        aria-label="Annotations"
        aria-describedby={instructions}
        style={renderAll ? undefined : { height: virtualizer.getTotalSize(), position: "relative" }}
      >
        {items.map((item) => {
          const annotation = results[item.index];
          return annotation ? (
            <div
              key={annotation.id}
              role="listitem"
              // Focusable listitems preserve list semantics and give keyboard navigation an anchor.
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
              tabIndex={0}
              aria-posinset={item.index + 1}
              aria-setsize={results.length}
              aria-current={annotation.id === readingId ? "location" : undefined}
              data-item-id={annotation.id}
              data-index={item.index}
              ref={renderAll ? undefined : virtualizer.measureElement}
              style={
                renderAll
                  ? undefined
                  : {
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${String(item.start)}px)`,
                    }
              }
            >
              {annotation.id === readingId ? (
                <small className="annotation-reading-label">Near reading position</small>
              ) : null}
              {renderCard(annotation)}
            </div>
          ) : null;
        })}
      </div>
    </>
  );
}

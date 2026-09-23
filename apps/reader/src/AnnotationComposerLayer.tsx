import { useLayoutEffect, useRef, useState, type CSSProperties, type JSX } from "react";

import { AnnotationComposer } from "./AnnotationComposer.js";

import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { ViewportRect } from "@mdbase-reader/reading-surface";

const gap = 10;
const margin = 12;
const cardWidth = 380;

/**
 * Places the new-annotation card beside a freshly made selection: below it when
 * there is room, otherwise above. Without a known position it docks at the
 * bottom of the document, as before.
 */
export function AnnotationComposerLayer({
  composer,
}: {
  readonly composer: AnnotationComposerController;
}): JSX.Element {
  const layer = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const anchor = composer.selection ? composer.selectionAnchor : null;
  useLayoutEffect(() => {
    const element = layer.current;
    if (!element || !anchor) {
      setStyle(null);
      return undefined;
    }
    const place = (): void => {
      const card = element.querySelector<HTMLElement>(".annotation-composer");
      setStyle(
        composerPlacement(element.getBoundingClientRect(), anchor, card?.offsetHeight ?? 160),
      );
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    const card = element.querySelector(".annotation-composer");
    if (card) {
      observer.observe(card);
    }
    return () => observer.disconnect();
  }, [anchor]);
  return (
    <div ref={layer} className={`document-annotation-composer${style ? " is-anchored" : ""}`}>
      <AnnotationComposer composer={composer} {...(style ? { style } : {})} />
    </div>
  );
}

export function composerPlacement(
  layer: Pick<DOMRect, "left" | "top" | "width" | "height">,
  anchor: ViewportRect,
  height: number,
): CSSProperties | null {
  // Phones keep the docked card: native selection handles and menus sit beside the text.
  if (layer.width < 520) {
    return null;
  }
  const width = Math.min(cardWidth, layer.width - margin * 2);
  const centre = anchor.x + anchor.width / 2 - layer.left;
  const left = Math.min(Math.max(centre - width / 2, margin), layer.width - width - margin);
  const below = anchor.y + anchor.height - layer.top + gap;
  const above = anchor.y - layer.top - gap - height;
  const fitsBelow = below + height <= layer.height - margin;
  const top = fitsBelow ? below : above >= margin ? above : null;
  // Neither side fits (a very tall selection): fall back to the docked card.
  return top === null ? null : { left, top, width };
}

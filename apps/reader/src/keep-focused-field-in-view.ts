/** Room left between a revealed field and the keyboard or the scroller's edge. */
const breathingPx = 12;

/**
 * How far to scroll a field's scroller so the field is in view: positive scrolls down. The visible
 * bottom is the scroller's bottom or the top of the on-screen keyboard, whichever is higher.
 */
export function revealOffset(
  field: { readonly top: number; readonly bottom: number },
  scroller: { readonly top: number; readonly bottom: number },
  visibleBottom: number,
): number {
  const bottom = Math.min(scroller.bottom, visibleBottom);
  if (field.bottom > bottom) {
    // A field taller than the room shows its top, where typing starts.
    return Math.min(field.bottom - bottom + breathingPx, field.top - scroller.top - breathingPx);
  }
  return field.top < scroller.top ? field.top - scroller.top - breathingPx : 0;
}

function scrollerOf(element: Element): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return null;
}

/**
 * When the on-screen keyboard opens, the viewport shrinks (or, where the browser only shrinks the
 * visual viewport, the keyboard covers its bottom). A comment field in a scrolling list, such as a
 * highlight being annotated, can end up beneath it. This scrolls the field's own list to show it.
 * The page root is never scrolled: Reader's shell does not scroll, and moving it would push the
 * header out of reach.
 */
export function keepFocusedFieldInView(view: Window): () => void {
  let frame = 0;
  let settled: ReturnType<typeof setTimeout> | undefined;
  const reveal = (): void => {
    const field = view.document.activeElement;
    if (!(field instanceof HTMLElement) || !field.matches("input, textarea")) {
      return;
    }
    const scroller = scrollerOf(field);
    if (!scroller) {
      return;
    }
    const viewport = view.visualViewport;
    const visibleBottom = viewport ? viewport.offsetTop + viewport.height : view.innerHeight;
    scroller.scrollTop += revealOffset(
      field.getBoundingClientRect(),
      scroller.getBoundingClientRect(),
      visibleBottom,
    );
  };
  // The workspace's panels follow a resize a moment later, so reveal again once they settle.
  const onResize = (): void => {
    view.cancelAnimationFrame(frame);
    clearTimeout(settled);
    frame = view.requestAnimationFrame(reveal);
    settled = setTimeout(reveal, 200);
  };
  view.addEventListener("resize", onResize);
  view.visualViewport?.addEventListener("resize", onResize);
  return () => {
    view.cancelAnimationFrame(frame);
    clearTimeout(settled);
    view.removeEventListener("resize", onResize);
    view.visualViewport?.removeEventListener("resize", onResize);
  };
}

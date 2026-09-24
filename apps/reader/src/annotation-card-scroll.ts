/** Reveal a card only within its list, never by scrolling the dock workspace.
 * Hidden workbench tabs remain mounted and can retain stale, taller geometry.
 */
export function scrollAnnotationCard(card: HTMLElement): void {
  const list = card.closest<HTMLElement>(".annotation-list");
  if (
    !list ||
    card.closest('[hidden], [inert], [aria-hidden="true"]') ||
    card.getClientRects().length === 0
  ) {
    return;
  }
  const view = card.ownerDocument.defaultView;
  if (view?.getComputedStyle(card).visibility !== "visible") {
    return;
  }
  const bounds = card.getBoundingClientRect();
  const listBounds = list.getBoundingClientRect();
  const top = listBounds.top + list.clientTop;
  const bottom = top + list.clientHeight;
  // Match block: nearest, including cards taller than the available viewport.
  let delta = 0;
  if (bounds.top < top && bounds.bottom < bottom) {
    delta = Math.max(bounds.top - top, bounds.bottom - bottom);
  } else if (bounds.bottom > bottom && bounds.top > top) {
    delta = Math.min(bounds.top - top, bounds.bottom - bottom);
  }
  if (delta !== 0) {
    list.scrollTo({
      top: list.scrollTop + delta,
      behavior: view.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }
}

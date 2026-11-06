import { isEditableTarget } from "@mdbase-reader/reading-surface";

function canScrollHtml(event: KeyboardEvent): boolean {
  const target = event.target as { closest?: Element["closest"] } | null;
  return !(
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    (event.shiftKey && event.key !== " ") ||
    isEditableTarget(event.target) ||
    (event.key === " " &&
      target?.closest?.('button, summary, [role="button"], [role="checkbox"], [role="switch"]'))
  );
}

export function scrollHtmlKey(event: KeyboardEvent, view: Window): boolean {
  if (!canScrollHtml(event)) {
    return false;
  }
  const modifier = event.ctrlKey || event.metaKey;
  const edge = modifier && (event.key === "Home" || event.key === "End");
  const page = !modifier && ["PageDown", "PageUp", " "].includes(event.key);
  if (!edge && !page) {
    return false;
  }
  event.preventDefault();
  const backwards = event.key === "PageUp" || (event.key === " " && event.shiftKey);
  const root = view.document.scrollingElement ?? view.document.documentElement;
  const top = edge
    ? event.key === "Home"
      ? 0
      : root.scrollHeight
    : view.scrollY + view.innerHeight * 0.875 * (backwards ? -1 : 1);
  view.scrollTo({
    top,
    behavior: "instant",
  });
  return true;
}

/** The article's reading edge, also used when classifying absolute scroll locations. */
export const htmlReadingInset = 24;

/** Scroll only the article viewport: scrollIntoView also scrolls its iframe's dock ancestors. */
export function scrollHtmlElement(
  view: Window,
  element: Element,
  alignment: "start" | "center",
): void {
  const bounds = element.getBoundingClientRect();
  const offset = alignment === "start" ? htmlReadingInset : (view.innerHeight - bounds.height) / 2;
  // One destination including the offset; a second scrollBy cancels smooth navigation.
  view.scrollTo({
    top: Math.max(0, view.scrollY + bounds.top - offset),
    behavior: view.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  });
}

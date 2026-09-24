/** Scroll only the article viewport: scrollIntoView also scrolls its iframe's dock ancestors. */
export function scrollHtmlElement(
  view: Window,
  element: Element,
  alignment: "start" | "center",
): void {
  const bounds = element.getBoundingClientRect();
  const offset = alignment === "start" ? 24 : (view.innerHeight - bounds.height) / 2;
  // One destination including the offset; a second scrollBy cancels smooth navigation.
  view.scrollTo({
    top: Math.max(0, view.scrollY + bounds.top - offset),
    behavior: view.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  });
}
